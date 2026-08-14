import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import esmPolicy from '../shared/access-policy.cjs';

const require = createRequire(import.meta.url);
const cjsPolicy = require('../shared/access-policy.cjs');

const EXPECTED_ROLES = [
  'SUPER_ADMIN',
  'INTENDENTE',
  'TENANT_ADMIN',
  'TENANT_USER',
  'CONTADOR',
  'INSPECTOR',
  'DEMO',
];

const EXPECTED_NAV_CAPABILITIES = [
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
  'navigation.audit',
  'navigation.export',
  'navigation.import',
  'navigation.help',
];

const EXECUTIVE_BASE = [
  'session.read',
  'navigation.workspace',
  'navigation.dashboard',
  'navigation.reports',
  'navigation.hacienda',
  'navigation.grh-executive',
  'navigation.organization-analytics',
  'navigation.territory',
  'navigation.data-quality',
  'navigation.rrhh',
  'navigation.ai-assistant',
];

const EXECUTIVE_WITH_DECISIONS = [
  ...EXECUTIVE_BASE.slice(0, 6),
  'navigation.grh-decisions',
  ...EXECUTIVE_BASE.slice(6),
];

const EXECUTIVE_WITH_EMPLOYMENT_ACTIONS = [
  ...EXECUTIVE_BASE.slice(0, 6),
  'navigation.employment-actions',
  ...EXECUTIVE_BASE.slice(6),
];

const EXECUTIVE_WITH_DECISIONS_AND_EMPLOYMENT_ACTIONS = [
  ...EXECUTIVE_BASE.slice(0, 6),
  'navigation.grh-decisions',
  'navigation.employment-actions',
  ...EXECUTIVE_BASE.slice(6),
];

const EXPECTED_ROLE_CAPABILITIES = {
  SUPER_ADMIN: [...EXECUTIVE_WITH_EMPLOYMENT_ACTIONS, 'navigation.audit', 'navigation.export', 'navigation.import', 'navigation.help'],
  INTENDENTE: [...EXECUTIVE_WITH_DECISIONS_AND_EMPLOYMENT_ACTIONS, 'navigation.audit', 'navigation.export', 'navigation.help'],
  TENANT_ADMIN: [...EXECUTIVE_WITH_DECISIONS_AND_EMPLOYMENT_ACTIONS, 'navigation.audit', 'navigation.export', 'navigation.import', 'navigation.help'],
  TENANT_USER: ['session.read', 'navigation.workspace', 'navigation.territory', 'navigation.help'],
  CONTADOR: [...EXECUTIVE_WITH_DECISIONS_AND_EMPLOYMENT_ACTIONS, 'navigation.export', 'navigation.help'],
  INSPECTOR: ['session.read', 'navigation.workspace', 'navigation.territory', 'navigation.help'],
  DEMO: ['session.read', 'navigation.workspace', 'navigation.territory', 'navigation.help'],
};

const EXPECTED_HOME_VARIANTS = {
  SUPER_ADMIN: 'platform-governance',
  INTENDENTE: 'executive-leadership',
  TENANT_ADMIN: 'municipal-operations',
  TENANT_USER: 'municipal-limited',
  CONTADOR: 'financial-control',
  INSPECTOR: 'territorial-unassigned',
  DEMO: 'controlled-preview',
};

const EXPECTED_NAV_HREFS = [
  'inicio.html',
  'dashboard.html',
  '/gestiones',
  '/ejecutivo',
  'decisiones-grh.html',
  'ia.html',
  'reportes.html',
  'hacienda.html',
  '/corridas-grh',
  '/conceptos-fijos',
  '/estructura',
  '/trayectoria',
  'movimientos-grh.html',
  'rrhh.html',
  'areas-grh.html',
  '/territorio',
  'cuentas-claras.html',
  'ciudadano.html',
  'importar.html',
  'auditoria.html',
  '/calidad',
  'exportar.html',
  'manuales.html',
];

const HIDDEN_UNGOVERNED_HREFS = [
  'analytics.html',
  'inteligencia.html',
  'presupuesto.html',
  'licitaciones.html',
  'obras.html',
  'mapa.html',
  'vecinos.html',
  'forms.html',
  'whatsapp.html',
  'admin.html',
  'configuracion.html',
];

async function readNavigationGlobals() {
  const source = await readFile(new URL('../js/navigation-catalog.js', import.meta.url), 'utf8');
  const window = {};
  runInNewContext(source, { window });
  return {
    catalog: window.MuniNavigationCatalog,
    definition: window.MuniNavigationDefinition,
    source,
  };
}

function extractRoleArray(source, constantName) {
  const match = source.match(new RegExp(`const ${constantName} = \\[([^\\]]+)\\]`));
  assert.ok(match, `${constantName} must remain explicit`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(role => role[1]);
}

test('Serverless, Express and the React session gate consume the same bumped policy', async () => {
  assert.strictEqual(esmPolicy, cjsPolicy);
  assert.equal(esmPolicy.ACCESS_POLICY_VERSION, '2026-08-13.4');
  assert.deepEqual(Object.values(esmPolicy.ROLES), EXPECTED_ROLES);

  const reactSession = await readFile(new URL('../frontend/src/auth/session.ts', import.meta.url), 'utf8');
  const reactVersion = reactSession.match(/const ACCESS_POLICY_VERSION = '([^']+)'/);
  assert.ok(reactVersion, 'React must expose one exact fail-closed access policy version');
  assert.equal(reactVersion[1], esmPolicy.ACCESS_POLICY_VERSION);
  const reactCapabilityBlock = reactSession.match(/const KNOWN_CAPABILITIES = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(reactCapabilityBlock, 'React must keep an explicit capability allowlist');
  const reactCapabilities = [...reactCapabilityBlock[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(reactCapabilities, Object.values(esmPolicy.CAPABILITIES));
  for (const profile of Object.values(esmPolicy.ROLE_HOME_PROFILE)) {
    assert.match(reactSession, new RegExp(`['"]${profile.variant}['"]`));
  }
  const reactPriorityBlock = reactSession.match(
    /const ROLE_HOME_PRIORITIES = Object\.freeze\(\{([\s\S]*?)\n\} as const\);/,
  );
  assert.ok(reactPriorityBlock, 'React must keep one explicit canonical home-priority map');
  for (const role of EXPECTED_ROLES) {
    const roleBlock = reactPriorityBlock[1].match(
      new RegExp(`${role}: Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\),`),
    );
    assert.ok(roleBlock, `React must keep canonical home priorities for ${role}`);
    const priorities = [...roleBlock[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
    assert.deepEqual(priorities, esmPolicy.ROLE_HOME_PROFILE[role].priorityCapabilities);
  }

  for (const role of EXPECTED_ROLES) {
    assert.deepEqual(esmPolicy.getCapabilitiesForRole(role), cjsPolicy.getCapabilitiesForRole(role));
  }
});

test('all login and me responses use the contextual session projection', async () => {
  const [serverlessLogin, serverlessMe, expressAuth] = await Promise.all([
    readFile(new URL('../api/auth/login.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/auth/me.js', import.meta.url), 'utf8'),
    readFile(new URL('../backend/routes/auth.js', import.meta.url), 'utf8'),
  ]);

  for (const [name, source] of [
    ['serverless login', serverlessLogin],
    ['serverless me', serverlessMe],
    ['Express login/me', expressAuth],
  ]) {
    assert.match(source, /getSessionAccessForUser\(/, `${name} must project the current user context`);
    assert.match(source, name === 'serverless me'
      ? /capabilities:\s*responseUser\.capabilities/
      : /capabilities:\s*sessionAccess\.capabilities/);
    assert.match(source, /accessPolicyVersion:\s*ACCESS_POLICY_VERSION/);
    assert.match(source, name === 'serverless me'
      ? /homeProfile:\s*responseUser\.homeProfile/
      : /homeProfile:\s*sessionAccess\.homeProfile/);
    assert.doesNotMatch(source, /getCapabilitiesForRole\(/, `${name} must not emit the static ceiling directly`);
  }
  assert.equal((expressAuth.match(/getSessionAccessForUser\(/g) || []).length, 2,
    'Express login and /me must each derive a fresh contextual projection');
});

test('the capability catalog contains only live navigation boundaries', () => {
  assert.deepEqual(Object.keys(esmPolicy.ROLE_CAPABILITIES), EXPECTED_ROLES);
  assert.deepEqual(
    Object.values(esmPolicy.CAPABILITIES),
    ['session.read', ...EXPECTED_NAV_CAPABILITIES],
  );

  for (const futureRole of ['TESORERIA', 'COMPRAS', 'RRHH', 'AUDITOR', 'SECRETARIA', 'EMPLEADO']) {
    assert.equal(esmPolicy.isKnownRole(futureRole), false);
    assert.deepEqual(esmPolicy.getCapabilitiesForRole(futureRole), []);
  }
});

test('role grants exactly match governed APIs and low roles receive no executive module', () => {
  for (const role of EXPECTED_ROLES) {
    const capabilities = esmPolicy.getCapabilitiesForRole(role);
    assert.deepEqual(capabilities, EXPECTED_ROLE_CAPABILITIES[role], role);
    assert.equal(new Set(capabilities).size, capabilities.length, `${role} contains duplicate capabilities`);
    assert.ok(capabilities.every(capability => esmPolicy.isKnownCapability(capability)));
    assert.equal(esmPolicy.hasCapability(role, 'navigation.workspace'), true, `${role} must receive a safe workspace`);
    assert.equal(esmPolicy.hasCapability(role, 'navigation.territory'), true, `${role} must receive the official territorial reference`);
    assert.equal(esmPolicy.hasCapability(role, 'navigation.help'), true, `${role} must discover the manual`);
  }

  for (const lowRole of ['TENANT_USER', 'INSPECTOR', 'DEMO']) {
    for (const executiveCapability of EXPECTED_NAV_CAPABILITIES.filter(capability =>
      capability !== 'navigation.workspace' && capability !== 'navigation.territory' && capability !== 'navigation.help'
    )) {
      assert.equal(esmPolicy.hasCapability(lowRole, executiveCapability), false, `${lowRole}:${executiveCapability}`);
    }
  }

  for (const importer of ['SUPER_ADMIN', 'TENANT_ADMIN']) {
    assert.equal(esmPolicy.hasCapability(importer, 'navigation.import'), true);
  }
  for (const nonImporter of ['INTENDENTE', 'CONTADOR', 'TENANT_USER', 'INSPECTOR', 'DEMO']) {
    assert.equal(esmPolicy.hasCapability(nonImporter, 'navigation.import'), false);
  }

  for (const auditor of ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE']) {
    assert.equal(esmPolicy.hasCapability(auditor, 'navigation.audit'), true);
  }
  assert.equal(esmPolicy.hasCapability('CONTADOR', 'navigation.audit'), false);
});

test('role home profiles are immutable, minimal and never expand grants', () => {
  assert.deepEqual(Object.keys(esmPolicy.ROLE_HOME_PROFILE), EXPECTED_ROLES);
  for (const role of EXPECTED_ROLES) {
    const canonical = esmPolicy.ROLE_HOME_PROFILE[role];
    const projected = esmPolicy.getHomeProfileForRole(role);
    assert.deepEqual(Object.keys(canonical).sort(), ['defaultPath', 'priorityCapabilities', 'variant']);
    assert.equal(canonical.variant, EXPECTED_HOME_VARIANTS[role]);
    assert.equal(canonical.defaultPath, 'inicio.html');
    assert.equal(Object.isFrozen(canonical), true);
    assert.equal(Object.isFrozen(canonical.priorityCapabilities), true);
    assert.equal(Object.isFrozen(projected), true);
    assert.equal(Object.isFrozen(projected.priorityCapabilities), true);
    assert.ok(projected.priorityCapabilities.includes('navigation.workspace'));
    assert.ok(projected.priorityCapabilities.every(capability => esmPolicy.hasCapability(role, capability)));
  }
  assert.equal(esmPolicy.getHomeProfileForRole('UNKNOWN_ROLE'), null);
  for (const lowRole of ['TENANT_USER', 'INSPECTOR', 'DEMO']) {
    assert.deepEqual(
      esmPolicy.getHomeProfileForRole(lowRole).priorityCapabilities,
      ['navigation.workspace', 'navigation.territory', 'navigation.help'],
      lowRole,
    );
  }
});

test('tenantless SUPER_ADMIN receives a contextual workspace without ambient municipal links', () => {
  const tenantless = esmPolicy.getSessionAccessForUser({ role: 'SUPER_ADMIN', tenantId: null });
  assert.deepEqual(tenantless.capabilities, ['session.read', 'navigation.workspace', 'navigation.help']);
  assert.deepEqual(tenantless.homeProfile.priorityCapabilities, ['navigation.workspace']);
  assert.equal(tenantless.homeProfile.defaultPath, 'inicio.html');
  assert.equal(Object.isFrozen(tenantless.capabilities), true);
  assert.equal(Object.isFrozen(tenantless.homeProfile), true);

  const tenantBound = esmPolicy.getSessionAccessForUser({ role: 'SUPER_ADMIN', tenantId: 'tenant-junin' });
  assert.deepEqual(tenantBound.capabilities, EXPECTED_ROLE_CAPABILITIES.SUPER_ADMIN);
  assert.equal(esmPolicy.getSessionAccessForUser({ role: 'UNKNOWN_ROLE', tenantId: null }), null);
  assert.equal(esmPolicy.getSessionAccessForUser(null), null);
});

test('organization analytics is projected to executive identities, including published demos, and denied to low roles', () => {
  const capability = esmPolicy.CAPABILITIES.NAV_ORGANIZATION_ANALYTICS;
  const executiveRoles = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR'];
  for (const role of executiveRoles) {
    const privateAccess = esmPolicy.getSessionAccessForUser({
      role,
      tenantId: 'tenant-junin',
      email: `private-${role.toLowerCase()}@example.test`,
    });
    assert.equal(privateAccess.capabilities.includes(capability), true, role);
  }

  for (const [role, email] of [
    ['TENANT_ADMIN', 'admin@junin.gov.ar'],
    ['INTENDENTE', 'intendente@junin.gov.ar'],
    ['CONTADOR', 'contador@junin.gov.ar'],
  ]) {
    const publishedAccess = esmPolicy.getSessionAccessForUser({ role, tenantId: 'tenant-junin', email });
    assert.equal(publishedAccess.capabilities.includes(capability), true, email);
  }

  for (const [role, email] of [
    ['TENANT_USER', 'rrhh@junin.gov.ar'],
    ['INSPECTOR', 'inspector@junin.gov.ar'],
    ['DEMO', 'demo@junin.gov.ar'],
  ]) {
    const publishedAccess = esmPolicy.getSessionAccessForUser({ role, tenantId: 'tenant-junin', email });
    assert.equal(publishedAccess.capabilities.includes(capability), false, email);
  }
});

test('the official territorial reference remains available to every tenant-bound role and published demo', () => {
  const capability = esmPolicy.CAPABILITIES.NAV_TERRITORY;
  for (const role of EXPECTED_ROLES) {
    const access = esmPolicy.getSessionAccessForUser({
      role,
      tenantId: 'tenant-junin',
      email: role === 'DEMO' ? 'demo@junin.gov.ar' : `${role.toLowerCase()}@example.test`,
    });
    assert.equal(access.capabilities.includes(capability), true, role);
  }
});

test('navigation grants stay aligned with the current GRH, audit, export and import APIs', async () => {
  const [rawGrhSource, aiSource, auditSource, exportSource, uploadSource, sheetsSource] = await Promise.all([
    readFile(new URL('../api/grh-data.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/ai-analyze.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/audit.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/export-data.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/upload-handler.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/google-sheets.js', import.meta.url), 'utf8'),
  ]);

  const grhRoles = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR'];
  const auditRoles = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE'];
  const importRoles = ['SUPER_ADMIN', 'TENANT_ADMIN'];
  assert.match(rawGrhSource, /RESOURCES\.GRH_CONTRACT/);
  assert.match(rawGrhSource, /ACTIONS\.READ/);
  assert.match(rawGrhSource, /GRH_RAW_CONTRACT_RETIRED/);
  assert.doesNotMatch(rawGrhSource, /readGrhArtifact|grh-artifacts|req\.query/);
  assert.deepEqual(extractRoleArray(aiSource, 'EXECUTIVE_ROLES'), grhRoles);
  assert.deepEqual(extractRoleArray(exportSource, 'EXPORT_ROLES'), grhRoles);
  assert.deepEqual(extractRoleArray(auditSource, 'AUDIT_READ_ROLES'), auditRoles);
  assert.deepEqual(extractRoleArray(uploadSource, 'IMPORT_ROLES'), importRoles);
  assert.deepEqual(extractRoleArray(sheetsSource, 'IMPORT_ROLES'), importRoles);

  for (const capability of [
    'navigation.dashboard',
    'navigation.reports',
    'navigation.hacienda',
    'navigation.grh-executive',
    'navigation.organization-analytics',
    'navigation.data-quality',
    'navigation.rrhh',
    'navigation.ai-assistant',
    'navigation.export',
  ]) {
    assert.deepEqual(
      EXPECTED_ROLES.filter(role => esmPolicy.hasCapability(role, capability)).sort(),
      [...grhRoles].sort(),
    );
  }
  assert.deepEqual(
    EXPECTED_ROLES.filter(role => esmPolicy.hasCapability(role, 'navigation.employment-actions')).sort(),
    ['CONTADOR', 'INTENDENTE', 'SUPER_ADMIN', 'TENANT_ADMIN'],
  );
  assert.deepEqual(
    EXPECTED_ROLES.filter(role => esmPolicy.hasCapability(role, 'navigation.grh-decisions')).sort(),
    ['CONTADOR', 'INTENDENTE', 'TENANT_ADMIN'],
  );
  assert.deepEqual(
    EXPECTED_ROLES.filter(role => esmPolicy.hasCapability(role, 'navigation.workspace')).sort(),
    [...EXPECTED_ROLES].sort(),
  );
  assert.deepEqual(
    EXPECTED_ROLES.filter(role => esmPolicy.hasCapability(role, 'navigation.territory')).sort(),
    [...EXPECTED_ROLES].sort(),
  );
  assert.deepEqual(
    EXPECTED_ROLES.filter(role => esmPolicy.hasCapability(role, 'navigation.audit')).sort(),
    [...auditRoles].sort(),
  );
  assert.deepEqual(
    EXPECTED_ROLES.filter(role => esmPolicy.hasCapability(role, 'navigation.import')).sort(),
    [...importRoles].sort(),
  );
});

test('unknown and inherited authorization attempts fail closed', () => {
  assert.deepEqual(esmPolicy.getCapabilitiesForRole('UNKNOWN_ROLE'), []);
  assert.deepEqual(esmPolicy.getCapabilitiesForRole('super_admin'), []);
  assert.equal(esmPolicy.hasCapability('SUPER_ADMIN', 'navigation.future-feature'), false);
  assert.equal(esmPolicy.hasCapability('UNKNOWN_ROLE', 'navigation.dashboard'), false);
  assert.equal(esmPolicy.hasExactRole('SUPER_ADMIN', 'TENANT_ADMIN'), false);
  assert.equal(esmPolicy.hasExactRole('INTENDENTE', 'TENANT_USER'), false);
  assert.equal(esmPolicy.hasExactRole('CONTADOR', 'TENANT_USER'), false);
  assert.equal(esmPolicy.hasExactRole('UNKNOWN_ROLE', 'UNKNOWN_ROLE'), false);
  assert.equal(esmPolicy.hasAnyRole('TENANT_ADMIN', ['INTENDENTE', 'CONTADOR']), false);
  assert.equal(esmPolicy.hasAnyRole('TENANT_ADMIN', ['UNKNOWN_ROLE']), false);
  assert.equal(esmPolicy.hasAnyRole('TENANT_ADMIN', 'TENANT_ADMIN'), false);
});

test('capability snapshots cannot mutate the canonical policy', () => {
  const first = esmPolicy.getCapabilitiesForRole('TENANT_USER');
  first.push('navigation.dashboard');
  const second = esmPolicy.getCapabilitiesForRole('TENANT_USER');

  assert.deepEqual(second, ['session.read', 'navigation.workspace', 'navigation.territory', 'navigation.help']);
  assert.equal(Object.isFrozen(esmPolicy.ROLE_CAPABILITIES.TENANT_USER), true);
});

test('desktop and mobile consume one authoritative hierarchical catalog without duplicates', async () => {
  const [source, navigation] = await Promise.all([
    readFile(new URL('../js/nav.js', import.meta.url), 'utf8'),
    readNavigationGlobals(),
  ]);
  const bottomSource = await readFile(new URL('../js/bottom-nav.js', import.meta.url), 'utf8');
  const items = Array.from(navigation.definition.items, item => ({ ...item }));
  const declaredCapabilities = items.map(item => item.capability).filter(Boolean).sort();

  assert.equal(navigation.definition.version, '2026-08-14.5');
  assert.deepEqual(
    Array.from(navigation.definition.groups, group => group.id),
    ['executive', 'people', 'territory', 'data'],
  );
  assert.deepEqual(items.map(item => item.href), EXPECTED_NAV_HREFS);
  assert.equal(new Set(items.map(item => item.href)).size, items.length, 'sidebar hrefs must be unique');
  assert.equal(new Set(items.map(item => item.label)).size, items.length, 'sidebar labels must be unique');
  assert.deepEqual(declaredCapabilities, [
    ...EXPECTED_NAV_CAPABILITIES,
    'navigation.dashboard',
    'navigation.hacienda',
    'navigation.hacienda',
    'navigation.organization-analytics',
    'navigation.rrhh',
  ].sort());
  assert.equal(items.filter(item => item.capability === 'navigation.organization-analytics').length, 2,
    'organization analytics exposes the situation room and the movement operations center');
  assert.equal(items.filter(item => item.capability === 'navigation.rrhh').length, 2,
    'RRHH exposes the governed domain explorer and the operational directory');
  assert.equal(items.filter(item => item.capability === 'navigation.hacienda').length, 3,
    'Hacienda exposes its dashboard plus payroll-run and fixed-concept controls');
  assert.equal(items.filter(item => item.capability === 'navigation.dashboard').length, 2,
    'the executive panorama exposes one secondary management timeline without a new grant');
  assert.equal(navigation.catalog['navigation.rrhh'].href, 'rrhh.html');
  assert.equal(navigation.catalog['navigation.organization-analytics'].href, '/estructura');
  assert.equal(navigation.catalog['navigation.employment-actions'].href, '/trayectoria');
  assert.equal(navigation.catalog['navigation.workspace'].href, 'inicio.html');
  assert.doesNotMatch(source, /var NAV_ITEMS\s*=\s*\[/,
    'the runtime must not fork a second literal catalog');
  assert.match(source, /MuniNavigationDefinition/);
  assert.match(bottomSource, /var CATALOG = window\.MuniNavigationCatalog;/);
  assert.doesNotMatch(bottomSource, /^\s*'navigation\.[^']+':\s*\{/m,
    'bottom navigation must not duplicate the authoritative catalog');

  assert.deepEqual(
    items.filter(item => item.placement !== 'group').map(item => [item.id, item.placement]),
    [['workspace', 'top'], ['manuales', 'footer']],
  );
  assert.ok(items.filter(item => item.placement === 'group').every(item => (
    navigation.definition.groups.some(group => group.id === item.groupId)
  )));
  assert.equal(items.find(item => item.id === 'ia').label, 'BOT IA para GRH');
  assert.equal(items.find(item => item.id === 'ia').shortLabel, 'BOT IA');
  assert.equal(items.find(item => item.id === 'decisiones-grh').label, 'Decisiones GRH');
  assert.equal(items.find(item => item.id === 'movimientos-grh').label, 'Movimientos de legajo');
  assert.equal(items.find(item => item.id === 'trayectoria').label, 'Trayectoria laboral');
  assert.equal(items.find(item => item.id === 'corridas-grh').label, 'Corridas y marcas de cierre');
  assert.equal(items.find(item => item.id === 'conceptos-fijos').label, 'Conceptos fijos y cálculo');
  assert.equal(items.filter(item => item.href === 'reportes.html').length, 1);
  assert.doesNotMatch(navigation.source, /access:\s*(?:'all'|\[)/);

  for (const hiddenHref of HIDDEN_UNGOVERNED_HREFS) {
    assert.equal(items.some(item => item.href === hiddenHref), false, hiddenHref);
    assert.doesNotMatch(bottomSource, new RegExp(hiddenHref.replace('.', '\\.')));
  }
});
