import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('learner-first source intake surface states its exact governed boundary', () => {
  const html = read('importar.html');

  assert.match(html, /id="sourceIntakeApp"[\s\S]*?data-contract="municipal-source-intake-v1"[\s\S]*?data-state="checking-access"/u);
  assert.match(html, /id="sourceIntakeIdentity"/u);
  assert.match(html, /id="sourceIntakeFile"/u);
  assert.match(html, /id="sourceIntakeResult"/u);
  assert.match(html, /id="sourceIntakeTabs"[^>]*role="tablist"/u);
  assert.match(html, /id="sourceIntakeHistoryTab"[^>]*role="tab"[^>]*aria-controls="sourceIntakeHistory"/u);
  assert.match(html, /id="sourceIntakeNewTab"[^>]*role="tab"[^>]*aria-controls="sourceIntakeNewPanel"/u);
  assert.match(html, /id="sourceIntakeHistory"[\s\S]*?role="tabpanel"[\s\S]*?Bandeja de fuentes recibidas/u);
  assert.match(html, /últimos comprobantes técnicos del municipio/u);
  assert.match(html, /no contienen filas, valores ni archivos originales/u);
  assert.match(html, /id="sourceIntakeHistorySearch"/u);
  assert.match(html, /id="sourceIntakeHistoryDomain"/u);
  assert.match(html, /id="sourceIntakeHistoryAttention"/u);
  assert.match(html, /id="sourceIntakeHistoryClear"/u);
  assert.match(html, /Ir al área de ingreso/u);
  assert.match(html, /Cargar y validar una fuente/u);
  assert.match(html, /Vista de funcionamiento · sólo lectura/u);
  assert.match(html, /sesión pública no envía ni analiza archivos/u);
  assert.match(html, /Quedó en cuarentena/u);
  assert.match(html, /registra (?:una|la) huella y (?:devuelve )?el diagnóstico/u);
  assert.match(html, /no conserva el archivo, no publica datos y no alimenta tableros ni al Asistente/iu);
  assert.match(html, /No se muestra una vista previa de valores/u);
  assert.match(html, /Máximo exacto: 4 MiB/u);
  assert.match(html, /accept="\.csv,\.xlsx,\.xls,\.json,\.pdf,\.txt"/u);
  assert.doesNotMatch(html, /id="sourceFile"[^>]*\bmultiple\b/iu);
  assert.match(html, /name="sourceLabel"/u);
  assert.match(html, /name="domain"/u);
  assert.match(html, /name="referencePeriod"/u);
  assert.match(html, /name="ownerOffice"/u);
  assert.match(html, /name="purpose"/u);
  assert.match(html, /name="classification"/u);
  assert.match(html, /name="authority"/u);
  assert.match(html, /name="currency"/u);
  assert.equal((html.match(/name="containsPersonalData"/gu) || []).length, 2);
  assert.match(html, /js\/source-intake\.js/u);

  assert.doesNotMatch(html, /Google Sheets|Google Drive|conexión a base|cadena de conexión|programación automática|Analizar con IA/iu);
  assert.doesNotMatch(html, /upload-handler|google-sheets|external-connector|Datos guardados en la base de datos/iu);
});

test('source intake client sends only the exact multipart contract and validates the response fail-closed', () => {
  const source = read('js/source-intake.js');

  assert.match(source, /var CONTRACT = 'municipal-source-intake-v1'/u);
  assert.match(source, /var ENDPOINT = '\/api\/source-intake'/u);
  assert.match(source, /var CONTRACT_HEADER = 'X-MuniControl-Contract'/u);
  assert.match(source, /var MAX_FILE_BYTES = 4 \* 1024 \* 1024/u);
  assert.match(source, /'csv', 'xlsx', 'xls', 'json', 'pdf', 'txt'/u);
  assert.match(source, /'budget', 'purchases', 'treasury', 'accounting', 'hr', 'works', 'general'/u);
  assert.match(source, /'operational_analysis', 'reconciliation', 'official_reporting'/u);
  assert.match(source, /'internal', 'confidential', 'restricted'/u);
  assert.match(source, /'unverified', 'owner_confirmed'/u);
  assert.match(source, /FINANCIAL_DOMAINS\.indexOf\(value\.domain\) === -1 \|\| value\.currency === 'ARS'/u);
  assert.match(source, /'sourceLabel', 'domain', 'referencePeriod', 'ownerOffice', 'purpose'/u);
  assert.match(source, /'classification', 'authority', 'currency', 'containsPersonalData'/u);
  assert.match(source, /body\.append\('file', file, file\.name\)/u);
  assert.match(source, /method: 'POST'/u);
  assert.match(source, /response\.headers\.get\(CONTRACT_HEADER\) !== CONTRACT/u);
  assert.match(source, /payload\.schemaVersion !== CONTRACT/u);
  assert.match(source, /payload\.maxFileBytes !== MAX_FILE_BYTES/u);
  assert.match(source, /validReceipt\(payload\.receipt, true\)/u);
  assert.match(source, /value\.checks\.length !== 7/u);
  assert.match(source, /authority_owner_confirmed/u);
  assert.match(source, /authority_unverified/u);
  assert.match(source, /personal_data_declared/u);
  assert.match(source, /personal_data_not_declared/u);
  assert.match(source, /'original_not_retained', 'antimalware_not_run', 'quarantine_not_publication'/u);
  assert.match(source, /value\.length !== REQUIRED_LIMIT_CODES\.length/u);
  assert.match(source, /validQuality\(value\.quality, value\.source\)/u);
  assert.match(source, /value\.status !== 'quarantined'/u);
  assert.match(source, /state\.root\.dataset\.mode = 'evaluation_read_only'/u);
  assert.match(source, /controls\[index\]\.disabled = true/u);
  assert.match(source, /if \(published\) installPublishedReadOnlyMode\(\);\s*else \{[\s\S]*?await loadHistory\(\);/u);
  assert.match(source, /method: 'GET'/u);
  assert.match(source, /payload\.receipts\.length > SOURCE_INTAKE_LIST_LIMIT/u);
  assert.match(source, /ids\.indexOf\(receipt\.id\) !== -1/u);
  assert.match(source, /selectTab\('history', false\)/u);
  assert.match(source, /element\('sourceIntakeHistory'\)\.hidden = !historySelected/u);
  assert.match(source, /normalize\('NFD'\)/u);
  assert.match(source, /replaceChildren\(fragment\)/u);
  assert.match(source, /attention === 'unverified'/u);
  assert.match(source, /attention === 'personal'/u);
  assert.match(source, /sourceIntakeHistoryClear/u);
  assert.match(source, /Controles de calidad/u);
  assert.match(source, /Límites del flujo/u);
  assert.match(source, /Fuentes en cuarentena/u);
  assert.doesNotMatch(source, /receipt\.persisted === false/u);
  assert.match(source, /No se declaró éxito ni se reintentó automáticamente/u);
  assert.match(source, /requireCapability\('navigation\.import'\)/u);
  assert.match(source, /projection\.capabilities\.indexOf\('navigation\.import'\)/u);
  assert.match(source, /textContent = receipt\.file\.sha256/u);
  assert.match(source, /renderProfile\(receipt\.profile\)/u);
  assert.match(source, /renderChecks\(receipt\)/u);

  assert.doesNotMatch(source, /\/api\/(?:upload-handler|google-sheets|external-connector)/u);
  assert.doesNotMatch(source, /FileReader|readAsText|readAsArrayBuffer|innerHTML|insertAdjacentHTML/u);
  assert.doesNotMatch(source, /fetch\(['"]https?:|OpenAI|Hugging\s*Face|ai-analyze/iu);
  assert.doesNotThrow(() => new Function(source));
});

test('source intake styles preserve touch, reduced-motion, forced-color, and 320px gates', () => {
  const css = read('css/source-intake.css');
  assert.match(css, /min-width:\s*320px/u);
  assert.match(css, /min-height:\s*4[46]px/u);
  assert.match(css, /@media \(max-width: 620px\)/u);
  assert.match(css, /@media \(max-width: 350px\)/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /@media \(forced-colors: active\)/u);
  assert.match(css, /overflow-x:\s*hidden/u);
});
