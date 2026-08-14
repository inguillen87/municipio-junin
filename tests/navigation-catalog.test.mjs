import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import accessPolicy from '../shared/access-policy.cjs';

const EXPECTED_GROUPS = ['executive', 'people', 'territory', 'data'];
const EXPECTED_ITEMS = [
  ['workspace', 'inicio.html', null, 'top'],
  ['dashboard', 'dashboard.html', 'executive', 'group'],
  ['grh-ejecutivo', '/ejecutivo', 'executive', 'group'],
  ['decisiones-grh', 'decisiones-grh.html', 'executive', 'group'],
  ['ia', 'ia.html', 'executive', 'group'],
  ['reportes', 'reportes.html', 'executive', 'group'],
  ['hacienda', 'hacienda.html', 'people', 'group'],
  ['estructura', '/estructura', 'people', 'group'],
  ['trayectoria', '/trayectoria', 'people', 'group'],
  ['movimientos-grh', 'movimientos-grh.html', 'people', 'group'],
  ['rrhh', 'rrhh.html', 'people', 'group'],
  ['areas-grh', 'areas-grh.html', 'people', 'group'],
  ['territorio', '/territorio', 'territory', 'group'],
  ['cuentas', 'cuentas-claras.html', 'territory', 'group'],
  ['ciudadano', 'ciudadano.html', 'territory', 'group'],
  ['importar', 'importar.html', 'data', 'group'],
  ['auditoria', 'auditoria.html', 'data', 'group'],
  ['control', '/calidad', 'data', 'group'],
  ['exportar', 'exportar.html', 'data', 'group'],
  ['manuales', 'manuales.html', null, 'footer'],
];

async function loadGlobals() {
  const source = await readFile(new URL('../js/navigation-catalog.js', import.meta.url), 'utf8');
  const window = {};
  runInNewContext(source, { window });
  return { source, window };
}

function assertDeepFrozen(value, path = 'definition') {
  assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === 'object') assertDeepFrozen(child, `${path}.${key}`);
  }
}

function visibleItems(definition, capabilities) {
  const allowed = new Set(capabilities);
  return Array.from(definition.items, item => item).filter(item => (
    item.public === true || (typeof item.capability === 'string' && allowed.has(item.capability))
  ));
}

test('navigation definition is exact, deeply immutable and free of parallel route identities', async () => {
  const { source, window } = await loadGlobals();
  const definition = window.MuniNavigationDefinition;
  assert.equal(definition.version, '2026-08-13.2');
  assert.deepEqual(Array.from(definition.groups, group => group.id), EXPECTED_GROUPS);
  assert.deepEqual(
    Array.from(definition.items, item => [item.id, item.href, item.groupId, item.placement]),
    EXPECTED_ITEMS,
  );
  assertDeepFrozen(definition);

  const items = Array.from(definition.items, item => ({ ...item }));
  assert.equal(new Set(items.map(item => item.id)).size, items.length, 'item ids');
  assert.equal(new Set(items.map(item => item.href)).size, items.length, 'item hrefs');
  assert.equal(new Set(items.map(item => item.label)).size, items.length, 'item labels');
  assert.equal(new Set(items.map(item => item.shortLabel)).size, items.length, 'short labels');
  assert.deepEqual(items.filter(item => item.public === true).map(item => item.id), ['cuentas', 'ciudadano']);
  assert.ok(items.filter(item => item.placement === 'group').every(item => EXPECTED_GROUPS.includes(item.groupId)));
  assert.ok(items.every(item => /^(?:\/[a-z0-9-]+|[a-z0-9-]+\.html)$/u.test(item.href)));
  assert.doesNotMatch(source, /https?:\/\//iu);
  assert.doesNotMatch(source, /(?:role|roles|access):\s*(?:'|\[)/iu);
});

test('primary compatibility catalog is derived once and stays capability-addressable', async () => {
  const { window } = await loadGlobals();
  const definition = window.MuniNavigationDefinition;
  const catalog = window.MuniNavigationCatalog;
  assert.equal(Object.isFrozen(catalog), true);
  const expected = new Map();
  for (const item of definition.items) {
    if (item.primary === true && item.capability && !expected.has(item.capability)) {
      expected.set(item.capability, item);
    }
  }
  assert.deepEqual(Object.keys(catalog), [...expected.keys()]);
  for (const [capability, item] of expected) {
    assert.equal(Object.isFrozen(catalog[capability]), true, capability);
    assert.deepEqual(
      ['id', 'href', 'icon', 'label', 'shortLabel', 'groupId'].map(key => catalog[capability][key]),
      [item.id, item.href, item.icon, item.label, item.shortLabel, item.groupId],
      capability,
    );
  }
  assert.equal(catalog['navigation.organization-analytics'].id, 'estructura');
  assert.equal(catalog['navigation.employment-actions'].id, 'trayectoria');
  assert.equal(catalog['navigation.rrhh'].id, 'rrhh');
});

test('catalog visibility follows the exact seven-role capability matrix', async () => {
  const { window } = await loadGlobals();
  const definition = window.MuniNavigationDefinition;
  for (const role of Object.values(accessPolicy.ROLES)) {
    const capabilities = accessPolicy.getCapabilitiesForRole(role);
    const items = visibleItems(definition, capabilities);
    assert.ok(items.some(item => item.id === 'workspace'), role);
    assert.ok(items.some(item => item.id === 'manuales'), role);
    assert.ok(items.every(item => item.public === true || capabilities.includes(item.capability)), role);
    const groups = EXPECTED_GROUPS.filter(groupId => items.some(item => item.groupId === groupId));
    if (['TENANT_USER', 'INSPECTOR', 'DEMO'].includes(role)) {
      assert.deepEqual(groups, ['territory'], role);
      assert.equal(items.some(item => item.id === 'estructura'), false, role);
    } else {
      assert.deepEqual(groups, EXPECTED_GROUPS, role);
    }
  }
});

test('executive labels remain concise and describe existing product surfaces', async () => {
  const { window } = await loadGlobals();
  const items = Array.from(window.MuniNavigationDefinition.items, item => item);
  const byId = new Map(items.map(item => [item.id, item]));
  assert.deepEqual(
    ['label', 'shortLabel'].map(key => byId.get('ia')[key]),
    ['BOT IA para GRH', 'BOT IA'],
  );
  assert.equal(byId.get('decisiones-grh').label, 'Decisiones GRH');
  assert.equal(byId.get('movimientos-grh').label, 'Movimientos de legajo');
  assert.equal(items.some(item => /comparar áreas/iu.test(item.label)), false,
    'the comparator remains an in-page Estructura workflow, not a new destination');
});
