import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTICE_KEY = 'mjunin_access_notice';
const NOTICE_TEXT = 'El perfil actual no tiene habilitada la superficie solicitada.';
const CONSUMERS = [
  'dashboard.html',
  'grh-ejecutivo.html',
  'js/rrhh.js',
  'js/grh-control.js',
  'hacienda.html',
  'reportes.html',
  'js/ia-assistant.js',
];

for (const relativePath of CONSUMERS) {
  test(`${relativePath} preserves a generic access notice before its local safe redirect`, async () => {
    const source = await readFile(path.join(REPO, relativePath), 'utf8');
    const start = source.indexOf('function redirectToSafeWorkspace()');
    const end = source.indexOf('async function requirePageCapability()', start);
    assert.ok(start >= 0 && end > start, `${relativePath} must keep a local fail-closed redirect boundary`);

    const redirect = source.slice(start, end);
    const readIndex = redirect.indexOf(`getItem('${NOTICE_KEY}')`);
    const writeIndex = redirect.indexOf(`setItem('${NOTICE_KEY}'`);
    const replaceIndex = redirect.indexOf("location.replace('inicio.html')");

    assert.ok(readIndex >= 0, `${relativePath} must inspect an existing notice`);
    assert.ok(writeIndex > readIndex, `${relativePath} must only write after checking the notice`);
    assert.ok(replaceIndex > writeIndex, `${relativePath} must persist the notice before redirecting`);
    assert.equal((redirect.match(/\.setItem\(/g) || []).length, 1, `${relativePath} must not overwrite the notice through another branch`);
    assert.match(redirect, /if\s*\(\s*!\s*(?:window|global)\.sessionStorage\.getItem\('mjunin_access_notice'\)\s*\)/);
    assert.ok(redirect.includes(NOTICE_TEXT), `${relativePath} must use the generic non-sensitive notice`);
    assert.doesNotMatch(redirect, /\b(?:DNI|CUIL|CBU|tenant|rol|role|permiso|capability)\b/i);
  });
}
