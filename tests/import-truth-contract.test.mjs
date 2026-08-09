import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'municontrol-import-contract-'));

after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function writeFixture(name, value) {
  const target = path.join(tempRoot, name);
  fs.writeFileSync(target, value, 'utf8');
  return target;
}

function createResponseHarness() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; }
  };
}

function csvWithRows(count) {
  const rows = ['legajo,nombre'];
  for (let index = 1; index <= count; index += 1) rows.push(`${index},Persona ${index}`);
  return rows.join('\n');
}

function createGoogleSheetsHarness({
  rowCount = 2,
  csv = null,
  contentType = 'text/csv; charset=utf-8',
  contentLength = null,
  failOnDataPoint = null,
  databaseUrl = 'postgresql://test:test@127.0.0.1:5432/import_test',
  nodeEnv = 'development',
} = {}) {
  const statements = [];
  const calls = { fetch: 0, arrayBuffer: 0, pool: 0, end: 0, release: 0, auth: 0, tenant: 0, dataPoints: 0 };
  const csvBytes = new TextEncoder().encode(csv ?? csvWithRows(rowCount));

  const client = {
    async query(sql, params) {
      const text = String(sql).trim();
      statements.push({ sql: text, params });
      if (text.startsWith('INSERT INTO datasets')) return { rows: [{ id: 'dataset-google-qa' }] };
      if (text.startsWith('INSERT INTO data_points')) {
        calls.dataPoints += 1;
        if (failOnDataPoint === calls.dataPoints) throw new Error('forced data point failure');
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() { calls.release += 1; }
  };

  class PoolClass {
    constructor() { calls.pool += 1; }
    async connect() { return client; }
    async end() { calls.end += 1; }
  }

  return {
    calls,
    statements,
    overrides: {
      PoolClass,
      databaseUrl,
      nodeEnv,
      async fetchImpl() {
        calls.fetch += 1;
        return {
          ok: true,
          status: 200,
          headers: {
            get(name) {
              const normalized = String(name).toLowerCase();
              if (normalized === 'content-type') return contentType;
              if (normalized === 'content-length' && contentLength !== null) return String(contentLength);
              return null;
            }
          },
          async arrayBuffer() {
            calls.arrayBuffer += 1;
            return csvBytes.buffer.slice(csvBytes.byteOffset, csvBytes.byteOffset + csvBytes.byteLength);
          }
        };
      },
      async requireRoleImpl(_req, _res, roles) {
        calls.auth += 1;
        assert.deepEqual(roles, ['SUPER_ADMIN', 'TENANT_ADMIN']);
        return { id: 'qa-admin', role: 'TENANT_ADMIN', tenantId: 'tenant-junin-test' };
      },
      requireDatasetTenantImpl(_res, caller, envName) {
        calls.tenant += 1;
        assert.equal(caller.tenantId, 'tenant-junin-test');
        assert.equal(envName, 'LEGACY_ANALYTICS_TENANT_ID');
        return true;
      }
    }
  };
}

test('import UI only reports server-confirmed parsing and persistence', () => {
  const source = read('importar.html');
  const inlineScripts = [...source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]);

  assert.match(source, /Base analítica legacy/);
  assert.match(source, /Estado por verificar/);
  assert.match(source, /fileData\.parsed === true/);
  assert.match(source, /fileData\.persisted === true/);
  assert.match(source, /Number\(fileData\.insertedRows\) > 0/);
  assert.match(source, /Solicitud de carga completada/);
  assert.match(source, /no fue registrado ni persistido/);
  assert.match(source, /Inventario de solo lectura/);
  assert.match(source, /esta carga no alimenta al Asistente GRH/i);
  assert.doesNotMatch(source, /Analizar con IA|downloadExport\(|deleteDataset\(/);
  assert.match(source, /accept="\.pdf,\.csv,\.xlsx,\.xls,\.json"/);
  assert.doesNotMatch(source, /id="fileInput"[^>]*\bmultiple\b/i);
  assert.match(source, /Carga segura de un archivo por vez/);
  assert.match(source, /if \(files\.length > 1\)/);
  assert.match(source, /No se envió ningún archivo; seleccioná uno solo/);
  assert.match(source, /Programado · no habilitado/);
  assert.match(source, /function classifyGoogleSheetsImport\(httpOk, result\)/);
  assert.match(source, /payload\.parsed === true/);
  assert.match(source, /payload\.persisted === true/);
  assert.match(source, /source === inserted \+ rejected/);
  assert.match(source, /state: 'truncated'/);
  assert.match(source, /state: 'partial'/);
  assert.match(source, /state: 'rejected'/);
  assert.match(source, /data-google-import-status/);
  assert.match(source, /type="month"[^>]*id="importPeriod"[^>]*required/);
  assert.match(source, /getSelectedImportPeriod\(\)/);
  assert.doesNotMatch(source, /getCurrentPeriod\(\)/);

  assert.doesNotMatch(source, /Neon DB conectada|>✅ Conectado<|Math\.random\(|fakeP|addFileToListLocal|archivo registrado localmente|Datos guardados en la base de datos|fonts\.googleapis\.com|font-family:\s*['"]?(?:Inter|Outfit)/);
  assert.doesNotMatch(source, /result\.success \|\| result\.ok|rowsImported|insertedRows \?\? result\.rowCount/);
  assert.doesNotMatch(source, /selectModule\(this,'(?:presupuesto|proveedores|control|analytics)'\)|<option>(?:MySQL|SQL Server|MongoDB|SQLite)<\/option>|<span class="format-pill">(?:XML|TXT)<\/span>/);
  for (const [index, script] of inlineScripts.entries()) {
    assert.doesNotThrow(() => new Function(script), `importar.html inline script ${index + 1} must parse`);
  }
});

test('upload parser rejects empty, malformed and scalar payloads before persistence', async () => {
  const { parseUploadFile } = await import('../api/upload-handler.js');

  const validJson = writeFixture('valid.json', JSON.stringify([{ legajo: 1 }, { legajo: 2 }]));
  const parsed = await parseUploadFile(validJson, '.json');
  assert.equal(parsed.sourceRowCount, 2);
  assert.deepEqual(parsed.records, [{ legajo: 1 }, { legajo: 2 }]);

  await assert.rejects(
    parseUploadFile(writeFixture('malformed.json', '{no-es-json'), '.json'),
    /JSON/
  );
  await assert.rejects(
    parseUploadFile(writeFixture('scalar.json', '42'), '.json'),
    /objetos estructurados/
  );
  await assert.rejects(
    parseUploadFile(writeFixture('header-only.csv', 'legajo,nombre\n'), '.csv'),
    /filas de datos/
  );
  await assert.rejects(
    parseUploadFile(writeFixture('empty-header.csv', 'legajo,\n1,valor\n'), '.csv'),
    /encabezados vacíos/
  );
});

test('upload handler contract is transactional and never marks a rejected parse as persisted', () => {
  const source = read('api/upload-handler.js');
  const parseFailure = source.indexOf('catch (parseErr)');
  const skipPersistence = source.indexOf('continue;', parseFailure);
  const persistenceCall = source.indexOf('await persistParsedUpload', skipPersistence);

  assert.ok(parseFailure >= 0 && skipPersistence > parseFailure && persistenceCall > skipPersistence);
  assert.match(source, /parsed:\s*false,[\s\S]*?persisted:\s*false/);
  assert.match(source, /await client\.query\('BEGIN'\)/);
  assert.match(source, /await client\.query\('COMMIT'\)/);
  assert.match(source, /await client\.query\('ROLLBACK'\)/);
  assert.match(source, /const success = persistedCount > 0 && failedCount === 0/);
  assert.match(source, /persistedCount > 0 \? 207 : 422/);
  assert.doesNotMatch(source, /processed\) correctly|procesado\(s\) correctamente|return \{ text: fs\.readFileSync\(filepath, 'utf8'\)/i);
});

test('Google Sheets handler rejects an empty body after auth and before fetch or persistence', async () => {
  const { createGoogleSheetsHandler } = await import('../api/google-sheets.js');
  const harness = createGoogleSheetsHarness();
  const handler = createGoogleSheetsHandler(harness.overrides);
  const response = createResponseHarness();

  await handler({ method: 'POST', body: {}, headers: {} }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.parsed, false);
  assert.equal(response.body.persisted, false);
  assert.equal(harness.calls.auth, 1);
  assert.equal(harness.calls.tenant, 1);
  assert.equal(harness.calls.fetch, 0);
  assert.equal(harness.calls.pool, 0);
  assert.deepEqual(harness.statements, []);
});

test('Google Sheets requires an explicit source period before fetch or persistence', async () => {
  const { createGoogleSheetsHandler } = await import('../api/google-sheets.js');
  const harness = createGoogleSheetsHarness();
  const handler = createGoogleSheetsHandler(harness.overrides);
  const response = createResponseHarness();

  await handler({
    method: 'POST',
    headers: {},
    body: { spreadsheetId: 'sheet_without_period', module: 'rrhh' }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /período.*obligatorio/i);
  assert.equal(response.body.persisted, false);
  assert.equal(harness.calls.fetch, 0);
  assert.equal(harness.calls.pool, 0);
  assert.deepEqual(harness.statements, []);
});

test('Google Sheets rejects an unverified remote database before fetch or persistence', async () => {
  const { createGoogleSheetsHandler } = await import('../api/google-sheets.js');
  const harness = createGoogleSheetsHarness({
    databaseUrl: 'postgresql://user:secret@db.example.test/municipio?sslmode=disable',
    nodeEnv: 'production',
  });
  const handler = createGoogleSheetsHandler(harness.overrides);
  const response = createResponseHarness();

  await handler({
    method: 'POST',
    headers: {},
    body: { spreadsheetId: 'sheet_tls_rejected', module: 'rrhh', period: '2026-07' }
  }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.parsed, false);
  assert.equal(response.body.persisted, false);
  assert.equal(harness.calls.fetch, 0);
  assert.equal(harness.calls.pool, 0);
  assert.deepEqual(harness.statements, []);
});

test('Google Sheets handler commits a coherent full persistence contract', async () => {
  const { createGoogleSheetsHandler } = await import('../api/google-sheets.js');
  const harness = createGoogleSheetsHarness({ rowCount: 2 });
  const handler = createGoogleSheetsHandler(harness.overrides);
  const response = createResponseHarness();

  await handler({
    method: 'POST',
    headers: {},
    body: { spreadsheetId: 'sheet_full_qa', module: 'rrhh', period: '2026-07' }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual({
    success: response.body.success,
    status: response.body.status,
    partial: response.body.partial,
    parsed: response.body.parsed,
    persisted: response.body.persisted,
    sourceRowCount: response.body.sourceRowCount,
    parsedRows: response.body.parsedRows,
    rowCount: response.body.rowCount,
    insertedRows: response.body.insertedRows,
    persistedRows: response.body.persistedRows,
    rejectedRows: response.body.rejectedRows,
    truncated: response.body.truncated,
    limit: response.body.limit
  }, {
    success: true,
    status: 'success',
    partial: false,
    parsed: true,
    persisted: true,
    sourceRowCount: 2,
    parsedRows: 2,
    rowCount: 2,
    insertedRows: 2,
    persistedRows: 2,
    rejectedRows: 0,
    truncated: false,
    limit: 5000
  });
  assert.equal(response.body.id, response.body.datasetId);
  assert.equal(harness.calls.dataPoints, 2);
  assert.equal(harness.statements.filter(item => item.sql === 'COMMIT').length, 1);
  assert.equal(harness.statements.filter(item => item.sql === 'ROLLBACK').length, 0);
  assert.equal(harness.calls.release, 1);
  assert.equal(harness.calls.end, 1);
});

test('Google Sheets preserves quoted commas, multiline fields, escaped quotes, and numeric-looking strings', async () => {
  const { createGoogleSheetsHandler } = await import('../api/google-sheets.js');
  const csv = [
    'Legajo,Observación,Importe',
    '"001","Primera, línea',
    'Segunda ""citada""","00123"',
    '"002","Sin novedad","10.00"',
  ].join('\n');
  const harness = createGoogleSheetsHarness({ csv });
  const handler = createGoogleSheetsHandler(harness.overrides);
  const response = createResponseHarness();

  await handler({
    method: 'POST',
    headers: {},
    body: { spreadsheetId: 'sheet_multiline_qa', module: 'rrhh', period: '2026-08' }
  }, response);

  const persistedRows = harness.statements
    .filter(item => item.sql.startsWith('INSERT INTO data_points'))
    .map(item => JSON.parse(item.params[3]));
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.sourceRowCount, 2);
  assert.equal(response.body.insertedRows, 2);
  assert.deepEqual(persistedRows, [
    { legajo: '001', observacion: 'Primera, línea\nSegunda "citada"', importe: '00123' },
    { legajo: '002', observacion: 'Sin novedad', importe: '10.00' },
  ]);
  assert.equal(typeof persistedRows[0].legajo, 'string');
  assert.equal(typeof persistedRows[0].importe, 'string');
  assert.equal(harness.statements.filter(item => item.sql === 'COMMIT').length, 1);
});

test('Google Sheets accepts a legitimate single-column CSV as strings', async () => {
  const { createGoogleSheetsHandler } = await import('../api/google-sheets.js');
  const harness = createGoogleSheetsHarness({ csv: 'Legajo\n001\n002' });
  const handler = createGoogleSheetsHandler(harness.overrides);
  const response = createResponseHarness();

  await handler({
    method: 'POST',
    headers: {},
    body: { spreadsheetId: 'sheet_single_column_qa', module: 'rrhh', period: '2026-08' }
  }, response);

  const persistedRows = harness.statements
    .filter(item => item.sql.startsWith('INSERT INTO data_points'))
    .map(item => JSON.parse(item.params[3]));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(persistedRows, [{ legajo: '001' }, { legajo: '002' }]);
});

test('Google Sheets rejects malformed or unsafe CSV before opening a transaction', async t => {
  const { createGoogleSheetsHandler } = await import('../api/google-sheets.js');
  const tooManyColumns = Array.from({ length: 201 }, (_, index) => `col_${index}`).join(',') +
    '\n' + Array.from({ length: 201 }, () => 'x').join(',');
  const oversizedBody = `a,b\n1,${'x'.repeat(5 * 1024 * 1024)}`;
  const fixtures = [
    { name: 'HTML MIME', csv: '<!doctype html><html><body>login</body></html>', contentType: 'text/html', status: 415 },
    { name: 'HTML disguised as CSV', csv: '<!doctype html><html><body>login</body></html>', status: 400 },
    { name: 'missing MIME', csv: 'a,b\n1,2', contentType: '', status: 415 },
    { name: 'unterminated quote', csv: 'legajo,nombre\n1,"sin cierre', status: 400 },
    { name: 'empty header', csv: 'legajo,\n1,Ana', status: 400 },
    { name: 'case-insensitive duplicate header', csv: 'Nombre,nombre\nAna,Alias', status: 400 },
    { name: 'normalized header collision', csv: 'Área Activa,area-activa\nA,B', status: 400 },
    { name: '__proto__ header', csv: '__proto__,valor\nx,y', status: 400 },
    { name: 'constructor header', csv: 'constructor,valor\nx,y', status: 400 },
    { name: 'prototype header', csv: 'prototype,valor\nx,y', status: 400 },
    { name: 'extra field', csv: 'a,b\n1,2,3', status: 400 },
    { name: 'column limit', csv: tooManyColumns, status: 400 },
    { name: 'row limit', csv: csvWithRows(10001), status: 400 },
    { name: 'declared byte limit', csv: 'a,b\n1,2', contentLength: 5 * 1024 * 1024 + 1, status: 413 },
    { name: 'actual byte limit', csv: oversizedBody, status: 413 },
  ];

  for (const fixture of fixtures) {
    await t.test(fixture.name, async () => {
      const harness = createGoogleSheetsHarness(fixture);
      const handler = createGoogleSheetsHandler(harness.overrides);
      const response = createResponseHarness();

      await handler({
        method: 'POST',
        headers: {},
        body: { spreadsheetId: 'sheet_rejected_qa', module: 'rrhh', period: '2026-08' }
      }, response);

      assert.equal(response.statusCode, fixture.status);
      assert.equal(harness.calls.pool, 0);
      assert.equal(harness.calls.dataPoints, 0);
      assert.equal(harness.statements.some(item => item.sql === 'BEGIN'), false);
      if (fixture.status !== 413) {
        assert.equal(response.body.parsed, false);
        assert.equal(response.body.persisted, false);
      }
    });
  }
});

test('Google Sheets handler truncates 5002 rows at 5000 and commits exact counts', async () => {
  const { createGoogleSheetsHandler } = await import('../api/google-sheets.js');
  const harness = createGoogleSheetsHarness({ rowCount: 5002 });
  const handler = createGoogleSheetsHandler(harness.overrides);
  const response = createResponseHarness();

  await handler({
    method: 'POST',
    headers: {},
    body: { spreadsheetId: 'sheet_limit_qa', module: 'hacienda', period: '2026-07' }
  }, response);

  assert.equal(response.statusCode, 207);
  assert.equal(response.body.parsed, true);
  assert.equal(response.body.persisted, true);
  assert.equal(response.body.status, 'partial');
  assert.equal(response.body.partial, true);
  assert.equal(response.body.sourceRowCount, 5002);
  assert.equal(response.body.parsedRows, 5002);
  assert.equal(response.body.insertedRows, 5000);
  assert.equal(response.body.persistedRows, 5000);
  assert.equal(response.body.rowCount, 5000);
  assert.equal(response.body.rejectedRows, 2);
  assert.equal(response.body.truncated, true);
  assert.equal(response.body.limit, 5000);
  assert.equal(response.body.sourceRowCount, response.body.insertedRows + response.body.rejectedRows);
  assert.equal(harness.calls.dataPoints, 5000);
  const datasetInsert = harness.statements.find(item => item.sql.startsWith('INSERT INTO datasets'));
  assert.equal(datasetInsert.params[3], 5000);
  assert.equal(harness.statements.filter(item => item.sql === 'COMMIT').length, 1);
  assert.equal(harness.statements.filter(item => item.sql === 'ROLLBACK').length, 0);
});

test('Google Sheets handler rolls back and never claims persistence after a database failure', async () => {
  const { createGoogleSheetsHandler } = await import('../api/google-sheets.js');
  const harness = createGoogleSheetsHarness({ rowCount: 3, failOnDataPoint: 2 });
  const handler = createGoogleSheetsHandler(harness.overrides);
  const response = createResponseHarness();

  const originalConsoleError = console.error;
  const loggedErrors = [];
  console.error = (...args) => loggedErrors.push(args.join(' '));
  try {
    await handler({
      method: 'POST',
      headers: {},
      body: { spreadsheetId: 'sheet_rollback_qa', module: 'obras', period: '2026-07' }
    }, response);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.parsed, true);
  assert.equal(response.body.persisted, false);
  assert.equal(response.body.sourceRowCount, 3);
  assert.equal(response.body.insertedRows, 0);
  assert.equal(response.body.rejectedRows, 3);
  assert.equal(harness.statements.filter(item => item.sql === 'ROLLBACK').length, 1);
  assert.equal(harness.statements.filter(item => item.sql === 'COMMIT').length, 0);
  assert.equal(harness.calls.release, 1);
  assert.equal(harness.calls.end, 1);
  assert.ok(loggedErrors.some(message => /Google Sheets import error/.test(message)));
});
