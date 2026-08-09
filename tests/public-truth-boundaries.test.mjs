import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('login markets only implemented, source-governed capabilities', async () => {
  const source = await read('login.html');
  assert.match(source, /Snapshot GRH gobernado/);
  assert.match(source, /No es tiempo real/);
  assert.match(source, /Sin PII/);
  assert.doesNotMatch(source, /data-count=|Analytics en tiempo real|predicciones|permisos granulares/i);
  assert.doesNotMatch(source, /1[.,]204|94\s*%|67\s*%/);
});

test('offline page does not claim local data, queued writes or unverified encryption', async () => {
  const source = await read('offline.html');
  assert.match(source, /no muestra datos operativos ni acepta cambios sin conexión/i);
  assert.match(source, /No se ponen en cola/);
  assert.doesNotMatch(source, /todo se sincronizará|empleados en caché|Disponible offline|AES-256/i);
  assert.doesNotMatch(source, /https:\/\/fonts\.(?:googleapis|gstatic)\.com/i);
  assert.doesNotMatch(source, /js\/(?:nav|bottom-nav)\.js/i);
});

test('WhatsApp citizen commands fail closed without fake tickets, news or unsupported portals', async () => {
  const source = await read('api/whatsapp-webhook.js');
  assert.match(source, /integraci\\u00F3n 311 est\\u00E1 deshabilitada/);
  assert.match(source, /no tiene una agenda de turnos conectada/);
  assert.match(source, /fuente editorial verificada/);
  assert.doesNotMatch(source, /Math\.random|REC-|ciudadano\.html/);
  assert.doesNotMatch(source, /Inauguraci\\u00F3n|Operativo de salud|Nuevo sistema de turnos online/);
  assert.doesNotMatch(source, /GPS:\s*\$\{|registrar tu reclamo|reservar tu turno/i);
});
