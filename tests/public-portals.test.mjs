import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTALS = ['cuentas-claras.html', 'ciudadano.html'];

function visibleText(html) {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

for (const filename of PORTALS) {
  test(`${filename} is a static, fail-closed public surface`, async () => {
    const html = await readFile(path.join(REPO, filename), 'utf8');
    const text = visibleText(html);

    assert.match(html, /<html\s+lang="es">/i);
    assert.match(html, /<main\s+id="contenido">/i);
    assert.match(html, /href="#contenido"[^>]*>Saltar al contenido</i);
    assert.equal((html.match(/<h1\b/gi) || []).length, 1);
    assert.match(text, /Fuente pública no conectada/i);

    assert.doesNotMatch(html, /<script\b|<form\b|<input\b|<select\b|<textarea\b|<button\b/i);
    assert.doesNotMatch(html, /\bonclick\s*=|\bonchange\s*=|\bonsubmit\s*=/i);
    assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|innerHTML|localStorage|sessionStorage/i);
    assert.doesNotMatch(html, /\bBearer\b|mjunin_token|Authorization\s*:/i);
    assert.doesNotMatch(html, /(?:src|href)\s*=\s*["'](?:https?:)?\/\//i);

    assert.doesNotMatch(text, /\bARS\b|\$\s*\d|\bDNI\b/i);
    assert.doesNotMatch(text, /\d+(?:[.,]\d+)?\s*%/i);
    assert.doesNotMatch(text, /Juan Pérez|38[.]452[.]123|saldo a favor|tiempo real/i);
    assert.doesNotMatch(text, /firma digital verificada|certificado oficial de transparencia|sesión: vecino autenticado/i);
  });
}

test('Cuentas Claras documents the fiscal open-data boundary without fake records', async () => {
  const html = await readFile(path.join(REPO, 'cuentas-claras.html'), 'utf8');
  const text = visibleText(html);

  assert.match(html, /id="portal-source-status"\s+data-source-state="disconnected"/i);
  assert.match(text, /Sin dato publicado/i);
  assert.match(text, /Contrato de datos abiertos/i);
  assert.match(text, /Presupuesto y ejecución/i);
  assert.match(text, /Compras y pagos/i);
  assert.match(text, /Calidad y privacidad/i);
  assert.match(text, /No hay registros públicos autorizados/i);
  assert.doesNotMatch(text, /EX-\d|proveedores certificados|total pagado|Monto auditado/i);
});

test('Citizen portal documents service contracts and collects no citizen data', async () => {
  const html = await readFile(path.join(REPO, 'ciudadano.html'), 'utf8');
  const text = visibleText(html);

  assert.match(html, /id="citizen-source-status"\s+data-source-state="disconnected"/i);
  assert.match(text, /No disponible/i);
  assert.match(text, /Contrato requerido para habilitar el portal/i);
  assert.match(text, /Identidad y consentimiento/i);
  assert.match(text, /Expedientes y reportes/i);
  assert.match(text, /Agenda municipal/i);
  assert.match(text, /no solicita, transmite ni guarda datos personales/i);
  assert.match(text, /No hay actividad para mostrar en esta vista/i);
  assert.doesNotMatch(text, /reclamo #[A-Z0-9-]+|turno #[A-Z0-9-]+|pase digital|código QR/i);
});
