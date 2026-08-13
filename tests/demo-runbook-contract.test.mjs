import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const runbookUrl = new URL('../docs/DEMO_INTENDENCIA_5_7_MIN.md', import.meta.url);
const workspaceUrl = new URL('../inicio.html', import.meta.url);
const navigationCatalogUrl = new URL('../js/navigation-catalog.js', import.meta.url);

test('el runbook de Intendencia conserva recorrido, verdad y rollback', async () => {
  const source = await readFile(runbookUrl, 'utf8');

  for (const route of [
    '/login', '/inicio', '/estructura', '/ejecutivo', '/hacienda', '/calidad',
    '/reportes', '/ia', '/territorio',
  ]) {
    assert.ok(source.includes('`' + route + '`'), `Falta la ruta ${route}.`);
  }
  assert.match(source, /6 de agosto de 2026/i);
  assert.match(source, /no (?:demuestra|es) una\s+conexi[oó]n en tiempo real/i);
  assert.match(source, /participantes de c[aá]lculo.+no.+personal activo/is);
  assert.match(source, /ARS.+configuraci[oó]n municipal.+no pago bancario/is);
  assert.match(source, /moneda (?:no )?declarada por el dump/i);
  assert.match(source, /no se publican filas crudas/i);
  assert.match(source, /20\.534 filas.+cuarentena/i);
  assert.match(source, /63,88\/100/i);
  assert.match(source, /\/grh-ejecutivo/);
  assert.match(source, /canary cerr[oó] sin cifras/i);
  assert.match(source, /6:00[–-]6:40/);
});

test('el runbook no contiene identidades, correos ni secretos de acceso', async () => {
  const source = await readFile(runbookUrl, 'utf8');

  assert.doesNotMatch(source, /[A-Z0-9._%+-]+@junin\.gov\.ar/i);
  assert.doesNotMatch(source, /(?:password|contrase(?:n|ñ)a)\s*[:=]\s*[^\s`]+/i);
  assert.doesNotMatch(source, /(?:bearer|api[_-]?key|secret)\s+[A-Za-z0-9._~-]{12,}/i);
});

test('Inicio descubre el canary ejecutivo y el catálogo conserva el retorno estable', async () => {
  const [workspace, navigationCatalog] = await Promise.all([
    readFile(workspaceUrl, 'utf8'),
    readFile(navigationCatalogUrl, 'utf8'),
  ]);

  assert.match(
    workspace,
    /'navigation\.grh-executive':\s*Object\.freeze\(\{\s*href:\s*'\/ejecutivo'/,
  );
  const scope = {};
  runInNewContext(navigationCatalog, { window: scope });
  const navigationItems = Array.from(scope.MuniNavigationDefinition.items, item => ({ ...item }));
  const executive = navigationItems.find(item => item.id === 'grh-ejecutivo');
  assert.deepEqual(executive, {
    id: 'grh-ejecutivo',
    href: '/ejecutivo',
    label: 'Resumen ejecutivo GRH',
    shortLabel: 'Resumen GRH',
    icon: 'people',
    groupId: 'executive',
    placement: 'group',
    capability: 'navigation.grh-executive',
    primary: true,
  });
  assert.equal(
    navigationItems.some(item => ['/grh-ejecutivo', 'grh-ejecutivo.html', '/grh-ejecutivo.html'].includes(item.href)),
    false,
    'legacy executive aliases must stay outside canonical navigation',
  );
});
