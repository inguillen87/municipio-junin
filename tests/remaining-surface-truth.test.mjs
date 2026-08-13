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
  assert.equal(docVersion, '1.10.0');
  assert.match(source, /release público[\s\S]{0,100}(?:v1\.10\.0[\s\S]{0,60}verificad|verificad[\s\S]{0,60}v1\.10\.0)/i);
  assert.match(source, /producto S13[\s\S]{0,40}commit[\s\S]{0,30}d11fd39/i);
  assert.match(source, /4108ca0f1b895d4c7ab0182ae8e453b115fe4ba7/);
  assert.match(source, /07ac9eacf8bd89f27f5c437b99e713e8497b8934/);
  assert.match(source, /dpl_9ANa9JwYgrG5iR6G4JEWXCSBfyNL[\s\S]{0,100}READY/i);
  assert.match(source, /gitSource master\/4108ca0/i);
  assert.match(source, /11\/11[\s\S]{0,80}exit\s*<code>0<\/code>/i);
  assert.match(source, /checkedAt 2026-08-09T16:33:56\.200Z/);
  assert.match(source, /10\/10 estados[\s\S]{0,100}390\/1440 px/i);
  assert.match(source, /logs del corte[\s\S]{0,80}0 errores[\s\S]{0,80}0 respuestas 500/i);
  assert.match(source, /agregados del snapshot aprobado[\s\S]{0,180}validación local/i);
  assert.match(source, /códigos de fuente\/celda/i);
  assert.match(source, /sesión privada positiva[\s\S]{0,100}S13 privado[\s\S]{0,120}validación local/i);
  assert.match(source, /no certifica[\s\S]{0,100}DB\/baseline[\s\S]{0,100}cuentas[\s\S]{0,100}MFA\/lifecycle[\s\S]{0,100}datos GRH remotos/i);
  assert.match(source, /post-release[\s\S]{0,80}no mueve[\s\S]{0,80}v1\.10\.0[\s\S]{0,40}4108ca0/i);
  assert.match(source, /grh-decision-brief-v1/);
  assert.match(source, /GET \/api\/grh-decision-brief/i);
  assert.match(source, /591 pruebas[\s\S]{0,100}590 aprobadas[\s\S]{0,80}0 fallidas[\s\S]{0,100}1 smoke opt-in omitido/i);
  assert.match(source, /backend 20\/20/i);
  assert.match(source, /data-doc-contract="operational-truth-v1"/);
  assert.match(source, /data-primary-source="grh"/);
  assert.match(source, /data-secondary-source-policy="personas-excluded"/);
  assert.match(source, /data-realtime="false"/);
  assert.match(source, /f9d1f88/);
  assert.match(source, /ed76347/);
  assert.match(source, /dpl_Euk4csdfWw5rayohoW3xXo1vXayY[\s\S]{0,100}Ready[\s\S]{0,80}Production/i);
  assert.match(source, /https:\/\/municipio-junin\.vercel\.app/);
  assert.match(source, /release:truth:check[\s\S]{0,100}10\/10[\s\S]{0,80}exit\s*<code>0<\/code>/i);
  assert.match(source, /checkedAt 2026-08-09T14:42:10Z/);
  assert.match(source, /\/login[\s\S]{0,80}\/roles[\s\S]{0,100}siete perfiles/i);
  assert.match(source, /390(?:\s*px)?[\s\S]{0,80}1440(?:\s*px)?[\s\S]{0,180}sin overflow/i);
  assert.match(source, /\/dashboard[\s\S]{0,100}\/inicio[\s\S]{0,100}\/manuales[\s\S]{0,100}an[oó]nimos[\s\S]{0,100}redirigieron al login/i);
  assert.match(source, /github\.com\/inguillen87\/municipio-junin\/releases\/tag\/v1\.9\.0[\s\S]{0,100}GitHub Release v1\.9\.0[\s\S]{0,80}live/i);
  assert.match(source, /MuniGu[ií]a privada[\s\S]{0,100}s[oó]lo local[\s\S]{0,100}proyecci[oó]n autoritativa simulada/i);
  assert.match(source, /no certifica[\s\S]{0,120}autorizaci[oó]n positiva[\s\S]{0,120}cuentas reales[\s\S]{0,120}DB[\s\S]{0,120}baseline restaurado[\s\S]{0,120}MFA\/lifecycle persistido[\s\S]{0,120}GRH remoto/i);
  assert.match(source, /documental post-release[\s\S]{0,100}no mueve el tag[\s\S]{0,80}v1\.9\.0/i);
  assert.match(source, /b82c0b3[\s\S]{0,100}master[\s\S]{0,80}tag[\s\S]{0,40}v1\.8\.1/i);
  assert.match(source, /dpl_A19n7grSSyuum3zuSQcdcaVKmt8F[\s\S]{0,80}Ready/i);
  assert.match(source, /release:truth:check[\s\S]{0,100}10\/10[\s\S]{0,80}exit\s*<code>0<\/code>/i);
  assert.match(source, /390(?:\s*px)?[\s\S]{0,100}1440(?:\s*px)?[\s\S]{0,180}sin overflow/i);
  assert.match(source, /GitHub Release[\s\S]{0,80}live/i);
  assert.match(source, /s[oó]lo registr(?:a|ó) evidencia documental post-release[\s\S]{0,100}no (?:mueve|movi[oó]) el tag/i);
  assert.doesNotMatch(source, /v1\.8\.1[\s\S]{0,180}(?:pendiente de push|requiere push|permanece local)/i);
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
    '1.10.0',
    '1.9.0',
    '1.8.1',
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
  assert.match(reports, /src="js\/tenant-presentation\.js"/);
  assert.match(reports, /MuniTenantPresentation\.load\(\)/);
  assert.match(reports, /pesos argentinos \(ARS\)/i);
  assert.match(reports, /currency === 'not_declared_in_source'/);
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
  assert.match(audit, /src="js\/data-operations\.js"/);
  assert.match(audit, /Fuentes de datos/i);
  assert.match(audit, /no es un historial de cargas/i);
  assert.doesNotMatch(audit, /\/api\/audit|Nueva conexión/);
  assert.doesNotMatch(audit, /Funcionalidad de nueva conexión en desarrollo/i);

  const exportsPage = read('exportar.html');
  assert.match(exportsPage, /src="js\/auth-fetch\.js"/);
  assert.match(exportsPage, /src="js\/data-operations\.js"/);
  assert.match(exportsPage, /Publicaciones/i);
  assert.match(exportsPage, /Las planillas con datos personales no están habilitadas/i);
  assert.doesNotMatch(exportsPage, /snapshot histórico|CSV\/XLSX nominal|huella, período|Calidad y trazabilidad|conciliación/i);
  assert.doesNotMatch(exportsPage, /MuniAuth\.(?:fetch|download)\('\/api\/(?:reports|export-data)/);
  assert.match(exportsPage, /no constituye un historial institucional/i);
  assert.doesNotMatch(exportsPage, /MuniDB|localStorage|innerHTML\s*=|generad[oa] exitosamente|>Completado</i);
  assert.doesNotMatch(exportsPage, /<script[^>]+src=["']https?:\/\//i);

  const controller = read('js/data-operations.js');
  assert.match(controller, /ENDPOINT = '\/api\/grh-domain-catalog'/);
  assert.match(controller, /MuniAuth\.fetch\('\/api\/pdf-report\?type=rrhh'/);
  assert.match(controller, /aggregateMetadataOnly !== true/);
  assert.match(controller, /No mostramos ceros ni publicaciones/i);
  assert.doesNotMatch(controller, /totalTables:\s*257|totalRows:\s*6573057|nonEmptyTables:\s*147/);
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
