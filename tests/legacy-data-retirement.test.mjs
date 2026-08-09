import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const dbPath = path.join(root, 'js', 'db.js');
const migratedPages = [
  'analytics.html',
  'forms.html',
  'licitaciones.html',
  'mapa.html',
  'obras.html',
  'presentacion.html',
  'presupuesto.html',
  'proveedores.html',
  'servicios.html',
  'talleres.html',
  'upload.html',
  'vecinos.html',
  'whatsapp.html'
];

const syntheticSensitiveLiteral = new RegExp(
  String.raw`(?:@junin\.gob\.ar|\b(?:dni|cuit|telefono|teléfono|domicilio|salario)\s*[:=]|(?:2362|549261)[-0-9]{6,}|\$\s?[0-9]|data-target=["'][0-9])`,
  'i'
);

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('legacy browser database contains no seeds or client-side persistence', () => {
  const source = fs.readFileSync(dbPath, 'utf8');

  for (const forbidden of [
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bSEEDS?\b/,
    /muni_db_/,
    /Local Database Engine/,
    /Simulates a real DB/i,
    syntheticSensitiveLiteral
  ]) {
    assert.doesNotMatch(source, forbidden);
  }
});

test('legacy compatibility API is empty and rejects every mutation or export', () => {
  const source = fs.readFileSync(dbPath, 'utf8');
  const context = vm.createContext({ window: {} });
  vm.runInContext(source, context, { filename: 'js/db.js' });

  const db = context.window.MuniDB;
  assert.ok(db);
  assert.equal(db.version, 'retired-3.0');
  assert.equal(db.operational, false);
  assert.equal(db.status.code, 'SOURCE_NOT_CONNECTED');
  assert.equal(db.isConnected(), false);
  assert.equal(Array.isArray(db.getAll('empleados')), true);
  assert.equal(db.getAll('empleados').length, 0);
  assert.equal(Object.isFrozen(db.getAll('empleados')), true);
  assert.equal(db.getOne('empleados', 'anything'), null);
  assert.equal(db.sum([], 'monto'), null);
  assert.equal(db.count([]), null);

  for (const operation of ['insert', 'update', 'delete', 'exportJSON', 'exportFull']) {
    assert.throws(
      () => db[operation]('empleados', {}),
      (error) => error?.code === 'SOURCE_NOT_CONNECTED' && error?.operation === operation
    );
  }
});

test('migrated pages expose only an explicit, fail-closed source state', () => {
  for (const page of migratedPages) {
    const source = read(page);
    assert.match(source, /data-retired-module="[a-z-]+"/, `${page} must declare its retired module`);
    assert.match(source, /data-source-state="not-connected"/, `${page} must expose the disconnected state`);
    assert.equal((source.match(/<script src="js\/db\.js"><\/script>/g) || []).length, 1, `${page} must load one retirement boundary`);
    assert.doesNotMatch(source, /MuniDB\.(?:getAll|getOne|query|insert|update|delete|export)/, `${page} must not use the legacy data API`);
    assert.doesNotMatch(source, /<script[^>]+src=["']https?:\/\//i, `${page} must not depend on a third-party script CDN`);
    assert.doesNotMatch(source, syntheticSensitiveLiteral, `${page} must not publish synthetic PII or metrics`);
  }
});

test('Control graduated from the legacy gate to the governed GRH quality surface', () => {
  const source = read('control.html');
  const controllerSource = read('js/grh-control.js');

  assert.match(source, /<script src="js\/auth-fetch\.js"><\/script>/);
  assert.match(source, /<script src="js\/grh-secure-data\.js"><\/script>/);
  assert.match(source, /<script src="js\/grh-control\.js"><\/script>/);
  assert.doesNotMatch(source, /(?:^|[/'"])(?:js\/)?db\.js/i);
  assert.doesNotMatch(source, /\bMuniDB\b/);
  assert.doesNotMatch(source, /data-retired-module=/);
  assert.match(controllerSource, /MuniGrhData\.loadQuality\s*\(/);
  assert.doesNotMatch(controllerSource, /\/api\/grh-data|readGrhArtifact|artifact=(?:profile|semantic)/);
});

test('every migrated GRH browser experience avoids the retired raw HTTP contract', () => {
  const governedExperienceFiles = [
    'index.html',
    'grh-ejecutivo.html',
    'control.html',
    'rrhh.html',
    'js/rrhh.js',
    'hacienda.html',
  ];

  for (const file of governedExperienceFiles) {
    assert.doesNotMatch(read(file), /\/api\/grh-data(?:\?|[/'"`]|$)/, `${file} still references the retired raw GRH contract`);
  }
});

test('every remaining db.js HTML load is either a migrated gate or an explicitly owned exclusion', () => {
  const exclusionsOwnedByOtherSprints = new Set(['index.html', 'ia-hf.html']);
  const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith('.html'));

  for (const page of htmlFiles) {
    const source = read(page);
    if (!/(?:^|[/'"])(?:js\/)?db\.js/i.test(source)) continue;
    if (exclusionsOwnedByOtherSprints.has(page)) continue;
    assert.match(source, /data-retired-module=/, `${page} still loads db.js operationally`);
  }
});

test('manuals no longer load the retired browser database', () => {
  assert.doesNotMatch(read('manuales.html'), /<script[^>]+src=["'][^"']*db\.js["']/i);
});
