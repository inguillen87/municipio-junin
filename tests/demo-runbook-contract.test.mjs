import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runbookUrl = new URL('../docs/DEMO_INTENDENCIA_5_7_MIN.md', import.meta.url);
const workspaceUrl = new URL('../inicio.html', import.meta.url);
const stableNavigationUrl = new URL('../js/nav.js', import.meta.url);

test('el runbook de Intendencia conserva recorrido, verdad y rollback', async () => {
  const source = await readFile(runbookUrl, 'utf8');

  for (const route of ['/login', '/inicio', '/ejecutivo', '/calidad', '/reportes', '/ia']) {
    assert.ok(source.includes('`' + route + '`'), `Falta la ruta ${route}.`);
  }
  assert.match(source, /6 de agosto de 2026/i);
  assert.match(source, /no (?:demuestra|es) una\s+conexi[oó]n en tiempo real/i);
  assert.match(source, /participantes de c[aá]lculo.+no.+personal activo/is);
  assert.match(source, /unidades de fuente.+no es pago bancario/is);
  assert.match(source, /moneda no est[aá] declarada/i);
  assert.match(source, /no se publican filas crudas/i);
  assert.match(source, /20\.534 filas.+cuarentena/i);
  assert.match(source, /63,88\/100/i);
  assert.match(source, /\/grh-ejecutivo/);
  assert.match(source, /canary cerr[oó] sin cifras/i);
  assert.match(source, /5:45[–-]6:20/);
});

test('el runbook no contiene identidades, correos ni secretos de acceso', async () => {
  const source = await readFile(runbookUrl, 'utf8');

  assert.doesNotMatch(source, /[A-Z0-9._%+-]+@junin\.gov\.ar/i);
  assert.doesNotMatch(source, /(?:password|contrase(?:n|ñ)a)\s*[:=]\s*[^\s`]+/i);
  assert.doesNotMatch(source, /(?:bearer|api[_-]?key|secret)\s+[A-Za-z0-9._~-]{12,}/i);
});

test('Inicio descubre el canary ejecutivo y la navegación conserva el retorno estable', async () => {
  const [workspace, navigation] = await Promise.all([
    readFile(workspaceUrl, 'utf8'),
    readFile(stableNavigationUrl, 'utf8'),
  ]);

  assert.match(
    workspace,
    /'navigation\.grh-executive':\s*Object\.freeze\(\{\s*href:\s*'\/ejecutivo'/,
  );
  assert.match(
    navigation,
    /href:'\/ejecutivo'[\s\S]{0,160}capability:'navigation\.grh-executive'/,
  );
  assert.doesNotMatch(navigation.match(/var NAV_ITEMS = \[[\s\S]*?\n\];/)?.[0] || '', /grh-ejecutivo\.html/);
});
