import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const DOC_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function inlineScripts(source) {
  return [...source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
}

function extractUniqueDocVersion(source) {
  assert.equal([...source.matchAll(/\bdata-doc-version\b/gi)].length, 1);
  const match = source.match(/\bdata-doc-version="([^"<>\r\n]+)"/i);
  assert.ok(match, 'data-doc-version must be a quoted, single-line value');
  return match[1];
}

test('the obsolete login copy and legacy intelligence surface are explicitly retired', () => {
  const loginCopy = read('index_loaded.html');
  assert.match(loginCopy, /http-equiv="refresh"\s+content="0;url=\/login\.html"/i);
  assert.match(loginCopy, /acceso heredado fue retirado/i);
  assert.doesNotMatch(loginCopy, /(?:local|session)Storage|Junin2026|data-count|@junin\.gov\.ar/i);
  assert.doesNotMatch(loginCopy, /<script[^>]+src=["']https?:\/\//i);

  const intelligence = read('inteligencia.html');
  assert.match(intelligence, /data-surface-state="retired"/);
  assert.match(intelligence, /data-retirement-code="410"/);
  assert.match(intelligence, /href="ia\.html"/);
  assert.match(intelligence, /href="grh-ejecutivo\.html"/);
  assert.match(intelligence, /unidad de origen, sin moneda inventada/i);
  assert.doesNotMatch(intelligence, /MuniAuth|fetch\(|\/api\/intelligence\?|jspdf|chart\.js|kpiEmpleados|cashflow|1\.05/i);
  assert.doesNotMatch(intelligence, /<script[^>]+src=["']https?:\/\//i);
});

test('configuration is an honest read-only gate and cannot collect browser secrets', () => {
  const source = read('configuracion.html');
  assert.match(source, /data-surface-state="blocked"/);
  assert.match(source, /data-config-contract="missing"/);
  assert.match(source, /No se guardó ninguna configuración/i);
  assert.match(source, /Ninguna credencial en el cliente/i);
  assert.doesNotMatch(source, /<(?:form|input|textarea|select)\b/i);
  assert.doesNotMatch(source, /saveSettings|downloadAudit|localStorage|sessionStorage|API Key|Connection String|Configuración guardada/i);
  assert.doesNotMatch(source, /fonts\.googleapis\.com|<script[^>]+src=["']https?:\/\//i);
});

test('the operations guide locks GRH provenance and removes obsolete demo documentation', () => {
  const source = read('manuales.html');
  const docVersion = extractUniqueDocVersion(source);
  assert.match(docVersion, DOC_SEMVER_PATTERN);
  assert.equal(docVersion, '1.8.0-rc.1');
  assert.match(source, /data-doc-contract="operational-truth-v1"/);
  assert.match(source, /data-primary-source="grh"/);
  assert.match(source, /data-secondary-source-policy="personas-excluded"/);
  assert.match(source, /data-realtime="false"/);
  assert.match(source, /backup de Personas.*fuera del contrato analítico/is);
  assert.match(source, /Control de cálculo, no pago bancario/i);
  assert.match(source, /la moneda no está declarada/i);
  assert.match(source, /Inteligencia legacy.*410/is);
  assert.doesNotMatch(source, /(?:SuperAdmin|Junin|Hacienda)2026!|demo123|@junin\.gob\.ar|@govtech\.ar/i);
  assert.doesNotMatch(source, /localStorage|sessionStorage\.setItem|js\/db\.js|ai-widget|chat-widget|fonts\.googleapis\.com/i);
  assert.doesNotMatch(source, /<script[^>]+src=["']https?:\/\//i);
});

test('the in-app document version accepts SemVer prereleases but rejects arbitrary and build values', () => {
  for (const value of [
    '0.0.0',
    '1.8.0',
    '1.8.0-rc.1',
    '10.20.30-alpha.beta-2',
  ]) assert.match(value, DOC_SEMVER_PATTERN, `${value} must be accepted`);

  for (const value of [
    'latest',
    'v1.8.0',
    '1.8',
    '01.8.0',
    '1.08.0',
    '1.8.00',
    '1.8.0-',
    '1.8.0-01',
    '1.8.0-rc..1',
    '1.8.0+build.1',
    '1.8.0-rc.1+build.1',
  ]) assert.doesNotMatch(value, DOC_SEMVER_PATTERN, `${value} must be rejected`);
});

test('remaining operational surfaces use authenticated APIs and fail closed without fabricated units', () => {
  const reports = read('reportes.html');
  assert.match(reports, /src="js\/auth-fetch\.js"/);
  assert.match(reports, /MuniAuth\.fetch\(endpoint\)/);
  assert.match(reports, /dataStatus\?\.available/);
  assert.match(reports, /moneda no está declarada/i);
  assert.match(reports, /document\.createElementNS\(SVG_NS, name\)/);
  assert.match(reports, /data-source="grh-executive-portable"/);
  assert.match(reports, /data-source-contract="grh-executive-report-v2"/);
  assert.match(reports, /source\?\.aggregateOnly === true && source\?\.containsPii === false/);
  assert.match(reports, /source\.excludedSources\[0\] === 'personas_junin'/);
  assert.match(reports, /'aria-labelledby': titleId \+ ' ' \+ descriptionId/);
  assert.match(reports, /renderChartEmpty\(container/);
  const reportStorageKeys = [...reports.matchAll(/sessionStorage\.(?:getItem|setItem)\(\s*['"]([^'"]+)['"]/g)]
    .map(match => match[1]);
  assert.deepEqual([...new Set(reportStorageKeys)], ['mjunin_access_notice']);
  assert.doesNotMatch(reports, /getItem\('mjunin_token'\)|currency:\s*['"]ARS['"]|\bDEMO\b|data_points/i);
  assert.doesNotMatch(reports, /<canvas\b|\bnew Chart\b|Chart\.defaults|Visualización no habilitada/i);
  assert.doesNotMatch(reports, /fonts\.googleapis\.com/i);
  assert.doesNotMatch(reports, /<script[^>]+src=["']https?:\/\//i);

  const audit = read('auditoria.html');
  assert.match(audit, /src="js\/auth-fetch\.js"/);
  assert.match(audit, /MuniAuth\.fetch\('\/api\/audit\?action=overview'\)/);
  assert.match(audit, /No se pudo verificar el inventario de datos/i);
  assert.match(audit, /no es una auditoría institucional/i);
  assert.match(audit, /Nueva conexión no habilitada/);
  assert.doesNotMatch(audit, /Funcionalidad de nueva conexión en desarrollo/i);

  const exportsPage = read('exportar.html');
  assert.match(exportsPage, /src="js\/auth-fetch\.js"/);
  assert.match(exportsPage, /MuniAuth\.fetch\('\/api\/pdf-report\?type=rrhh'/);
  assert.match(exportsPage, /Exportación cruda retirada/);
  assert.doesNotMatch(exportsPage, /MuniAuth\.(?:fetch|download)\('\/api\/(?:reports|export-data)/);
  assert.match(exportsPage, /Entregado · validar contenido/);
  assert.doesNotMatch(exportsPage, /MuniDB|localStorage|innerHTML\s*=|generad[oa] exitosamente|>Completado</i);
  assert.doesNotMatch(exportsPage, /<script[^>]+src=["']https?:\/\//i);
});

test('inline JavaScript on the audited surfaces parses', () => {
  for (const page of [
    'configuracion.html',
    'manuales.html',
    'inteligencia.html',
    'auditoria.html',
    'exportar.html',
    'reportes.html'
  ]) {
    for (const [index, script] of inlineScripts(read(page)).entries()) {
      assert.doesNotThrow(() => new Function(script), `${page} inline script ${index + 1} must parse`);
    }
  }
});
