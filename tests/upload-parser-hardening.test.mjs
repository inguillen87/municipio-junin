import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import * as xlsx from 'xlsx';

import handler, { parseUploadFile, UPLOAD_LIMITS } from '../api/upload-handler.js';

const root = path.resolve(import.meta.dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'municontrol-upload-hardening-'));
const XLSX_TARBALL = 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz';

after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function fixture(name, content) {
  const target = path.join(tempRoot, name);
  fs.writeFileSync(target, content);
  return target;
}

function spreadsheetFixture(name, bookType, matrix) {
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.aoa_to_sheet(matrix);
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Datos');
  return fixture(name, xlsx.write(workbook, { bookType, type: 'buffer' }));
}

function multiSheetFixture(name, sheets) {
  const workbook = xlsx.utils.book_new();
  for (const [sheetName, matrix] of sheets) {
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(matrix), sheetName);
  }
  return fixture(name, xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' }));
}

function pdfFixture(name, text) {
  const escaped = String(text).replace(/([\\()])/g, '\\$1');
  const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(document, 'latin1'));
    document += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document, 'latin1');
  document += `xref\n0 ${objects.length + 1}\n`;
  document += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    document += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return fixture(name, Buffer.from(document, 'latin1'));
}

function findZipEntry(buffer, expectedName) {
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 22 - 0xFFFF); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054B50 &&
        offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) {
      eocdOffset = offset;
      break;
    }
  }
  assert.ok(eocdOffset >= 0, 'fixture must contain a ZIP central directory');
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  let cursor = buffer.readUInt32LE(eocdOffset + 16);
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(buffer.readUInt32LE(cursor), 0x02014B50);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    if (name === expectedName) {
      return {
        centralOffset: cursor,
        localOffset: buffer.readUInt32LE(cursor + 42),
        nameLength,
      };
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  assert.fail(`ZIP fixture entry not found: ${expectedName}`);
}

function mutateZipFixture(name, mutate) {
  const sourcePath = spreadsheetFixture(`${name}-source.xlsx`, 'xlsx', [
    ['legajo', 'nombre'],
    [101, 'Ana'],
  ]);
  const buffer = Buffer.from(fs.readFileSync(sourcePath));
  const entry = findZipEntry(buffer, 'xl/worksheets/sheet1.xml');
  mutate(buffer, entry);
  return fixture(`${name}.xlsx`, buffer);
}

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    payload: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

test('SheetJS is pinned reproducibly to the official fixed 0.20.3 tarball', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const lockedPackage = lock.packages['node_modules/xlsx'];

  assert.equal(packageJson.dependencies.xlsx, XLSX_TARBALL);
  assert.equal(lock.packages[''].dependencies.xlsx, XLSX_TARBALL);
  assert.equal(lockedPackage.version, '0.20.3');
  assert.equal(lockedPackage.resolved, XLSX_TARBALL);
  assert.match(lockedPackage.integrity, /^sha512-/);
  assert.equal(xlsx.version, '0.20.3');
});

test('valid XLSX and legacy XLS files are read from buffers', async () => {
  const matrix = [
    ['legajo', 'nombre', 'detalle'],
    [101, 'Ana', 'Planta permanente'],
    [102, 'Luis', 'Contratado'],
  ];

  const xlsxResult = await parseUploadFile(
    spreadsheetFixture('empleados.xlsx', 'xlsx', matrix),
    '.xlsx'
  );
  const xlsResult = await parseUploadFile(
    spreadsheetFixture('empleados.xls', 'biff8', matrix),
    '.xls'
  );

  for (const result of [xlsxResult, xlsResult]) {
    assert.equal(result.sourceRowCount, 2);
    assert.deepEqual(result.records[0], {
      legajo: 101,
      nombre: 'Ana',
      detalle: 'Planta permanente',
    });
  }
});

test('valid multi-sheet XLSX is bounded as a workbook and imports only the first sheet', async () => {
  const parsed = await parseUploadFile(multiSheetFixture('multi-sheet.xlsx', [
    ['Datos', [
      ['legajo', 'nombre'],
      [101, 'Ana'],
      [102, 'Luis'],
    ]],
    ['Contexto', [
      ['clave', 'valor'],
      ['fuente', 'GRH'],
    ]],
  ]), '.xlsx');

  assert.equal(parsed.sourceRowCount, 2);
  assert.deepEqual(parsed.records, [
    { legajo: 101, nombre: 'Ana' },
    { legajo: 102, nombre: 'Luis' },
  ]);
  assert.ok(parsed.records.every(row => !Object.hasOwn(row, 'clave')));
});

test('a huge declared range in a secondary XLSX sheet is rejected', async () => {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([
    ['legajo', 'nombre'],
    [101, 'Ana'],
  ]), 'Datos');
  const secondary = xlsx.utils.aoa_to_sheet([['contexto'], ['vigente']]);
  secondary['!ref'] = 'A1:ZZ10000';
  xlsx.utils.book_append_sheet(workbook, secondary, 'Secundaria');
  const filepath = fixture('secondary-huge-range.xlsx', xlsx.write(workbook, {
    bookType: 'xlsx',
    type: 'buffer',
  }));

  await assert.rejects(
    parseUploadFile(filepath, '.xlsx'),
    /hoja 2 supera el límite/i
  );
});

test('XLSX ZIP preflight rejects bomb metadata before workbook parsing', async () => {
  const filepath = mutateZipFixture('zip-ratio-bomb', (buffer, entry) => {
    const compressedSize = buffer.readUInt32LE(entry.centralOffset + 20);
    const declaredSize = compressedSize * (UPLOAD_LIMITS.maxZipCompressionRatio + 1) + 1;
    assert.ok(declaredSize < UPLOAD_LIMITS.maxZipEntryUncompressedBytes);
    buffer.writeUInt32LE(declaredSize, entry.centralOffset + 24);
    buffer.writeUInt32LE(declaredSize, entry.localOffset + 22);
  });

  await assert.rejects(
    parseUploadFile(filepath, '.xlsx'),
    /relación de compresión/i
  );
});

test('XLSX ZIP preflight rejects ZIP64, encryption, and traversal metadata', async () => {
  const rejected = [
    ['zip64-metadata', (buffer, entry) => {
      buffer.writeUInt32LE(0xFFFFFFFF, entry.centralOffset + 24);
      buffer.writeUInt32LE(0xFFFFFFFF, entry.localOffset + 22);
    }, /ZIP64/i],
    ['encrypted-entry', (buffer, entry) => {
      buffer.writeUInt16LE(buffer.readUInt16LE(entry.centralOffset + 8) | 0x0001, entry.centralOffset + 8);
      buffer.writeUInt16LE(buffer.readUInt16LE(entry.localOffset + 6) | 0x0001, entry.localOffset + 6);
    }, /cifrada/i],
    ['traversal-entry', (buffer, entry) => {
      assert.ok(entry.nameLength >= 3);
      Buffer.from('../').copy(buffer, entry.centralOffset + 46);
      Buffer.from('../').copy(buffer, entry.localOffset + 30);
    }, /ruta ZIP/i],
  ];

  for (const [name, mutate, expected] of rejected) {
    await assert.rejects(parseUploadFile(mutateZipFixture(name, mutate), '.xlsx'), expected);
  }
});

test('empty, malformed, and format-confused spreadsheets fail closed', async () => {
  await assert.rejects(
    parseUploadFile(fixture('empty.xlsx', Buffer.alloc(0)), '.xlsx'),
    /vacío/
  );
  await assert.rejects(
    parseUploadFile(fixture('text-as-xlsx.xlsx', 'legajo,nombre\n1,Ana'), '.xlsx'),
    /firma/
  );
  await assert.rejects(
    parseUploadFile(fixture('text-as-xls.xls', 'legajo,nombre\n1,Ana'), '.xls'),
    /firma/
  );

  const headerOnly = spreadsheetFixture('header-only.xlsx', 'xlsx', [['legajo', 'nombre']]);
  await assert.rejects(parseUploadFile(headerOnly, '.xlsx'), /filas de datos/);
});

test('PapaParse preserves quoted commas, multiline fields, and escaped quotes', async () => {
  const csv = [
    'proveedor,detalle,codigo',
    '"Coma, SRL","línea uno',
    'línea ""dos""",A-1',
  ].join('\n');

  const parsed = await parseUploadFile(fixture('quoted.csv', csv), '.csv');
  assert.equal(parsed.sourceRowCount, 1);
  assert.deepEqual(parsed.records[0], {
    proveedor: 'Coma, SRL',
    detalle: 'línea uno\nlínea "dos"',
    codigo: 'A-1',
  });
});

test('PDF ingestion uses the installed parser API, extracts bounded text, and rejects format confusion', async () => {
  const parsed = await parseUploadFile(pdfFixture('informe.pdf', 'Informe municipal GRH'), '.pdf');
  assert.equal(parsed.sourceRowCount, 1);
  assert.equal(parsed.records[0].pageCount, 1);
  assert.match(parsed.records[0].text, /Informe municipal GRH/);

  await assert.rejects(
    parseUploadFile(fixture('texto.pdf', 'no es un documento PDF'), '.pdf'),
    /firma del archivo/i,
  );
});

test('CSV parser rejects syntax errors and empty, duplicate, or dangerous headers', async () => {
  const rejected = [
    ['unterminated.csv', 'nombre,detalle\nAna,"sin cierre', /CSV inválido/],
    ['empty-header.csv', 'nombre,\nAna,valor', /encabezados vacíos/],
    ['duplicate-header.csv', 'Nombre,nombre\nAna,Alias', /encabezados duplicados/],
    ['dangerous-header.csv', '__proto__.polluted,nombre\nsi,Ana', /encabezado no permitido/],
    ['extra-column.csv', 'nombre,detalle\nAna,uno,extra', /más columnas/],
  ];

  for (const [name, content, expected] of rejected) {
    await assert.rejects(parseUploadFile(fixture(name, content), '.csv'), expected);
  }
});

test('source row and record byte limits reject oversized payloads before persistence', async () => {
  const csvRows = ['id,nombre'];
  for (let index = 0; index <= UPLOAD_LIMITS.maxSourceRows; index += 1) {
    csvRows.push(`${index},Persona ${index}`);
  }
  await assert.rejects(
    parseUploadFile(fixture('too-many.csv', csvRows.join('\n')), '.csv'),
    new RegExp(`límite de ${UPLOAD_LIMITS.maxSourceRows} filas`)
  );

  const oversized = JSON.stringify([{ detalle: 'x'.repeat(UPLOAD_LIMITS.maxRecordBytes + 1) }]);
  await assert.rejects(
    parseUploadFile(fixture('oversized.json', oversized), '.json'),
    /Una fila supera el límite/
  );
});

test('legacy upload endpoint authenticates before returning an explicit 410 and keeps pure parser hardening', async () => {
  const response = responseRecorder();
  await handler({ method: 'POST', headers: {} }, response);

  assert.ok([401, 503].includes(response.statusCode));
  assert.match(response.payload?.error || '', /No autorizado|Autenticación no configurada/);

  const source = fs.readFileSync(path.join(root, 'api/upload-handler.js'), 'utf8');
  const roleGate = source.indexOf('await requireRoleImpl(req, res, IMPORT_ROLES)');
  const tenantGate = source.indexOf("requireDatasetTenantImpl(res, caller, 'LEGACY_ANALYTICS_TENANT_ID')");
  const retirement = source.indexOf("code: 'LEGACY_UPLOAD_IMPORT_RETIRED'");
  const zipPreflight = source.indexOf("if (ext === '.xlsx') preflightXlsxContainer(buffer)");
  const workbookRead = source.indexOf('xlsx.read(buffer,');
  assert.ok(roleGate >= 0 && tenantGate > roleGate && retirement > tenantGate);
  assert.doesNotMatch(source, /INSERT\s+INTO\s+(?:datasets|data_points)|await parseForm\(req\)/i);
  assert.ok(zipPreflight >= 0 && workbookRead > zipPreflight);
  assert.doesNotMatch(source, /res\.(?:status\([^)]*\)\.)?json\([^\n]*err\.message/);
  assert.doesNotMatch(source, /xlsx\.readFile\(/);
  assert.match(source, /xlsx\.read\(buffer,/);
  assert.match(source, /for \(let sheetIndex = 0; sheetIndex < workbook\.SheetNames\.length/);
});
