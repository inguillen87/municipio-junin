import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import * as xlsx from 'xlsx';

import {
  SOURCE_INTAKE_ALLOWED_EXTENSIONS,
  SOURCE_INTAKE_MAX_FILE_BYTES,
  SOURCE_INTAKE_PROFILE_SCHEMA_VERSION,
  SourceIntakeProfilerError,
  profileSourceIntake,
  validateSourceIntakeMetadata,
} from '../api/lib/source-intake-profiler.js';
import { normalizeProfiledSourceIntake } from '../api/lib/source-intake-contract.js';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'municontrol-source-intake-'));

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
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(matrix), 'Datos');
  return fixture(name, xlsx.write(workbook, { bookType, type: 'buffer' }));
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

function validMetadata(overrides = {}) {
  return {
    sourceLabel: 'Ejecucion presupuestaria mensual',
    domain: 'budget',
    referencePeriod: '2026-07',
    ownerOffice: 'Secretaria de Hacienda',
    purpose: 'reconciliation',
    classification: 'confidential',
    authority: 'owner_confirmed',
    currency: 'ARS',
    containsPersonalData: false,
    ...overrides,
  };
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function assertProfilerError(error, code, httpStatus) {
  assert.ok(error instanceof SourceIntakeProfilerError);
  assert.equal(error.code, code);
  assert.equal(error.httpStatus, httpStatus);
  return true;
}

function collectKeys(value, result = []) {
  if (!value || typeof value !== 'object') return result;
  for (const [key, child] of Object.entries(value)) {
    result.push(key);
    collectKeys(child, result);
  }
  return result;
}

function assertExactProfileKeys(profile) {
  assert.deepEqual(Object.keys(profile), [
    'schemaVersion',
    'schemaDigest',
    'rowCount',
    'columnCount',
    'emptyCellRatePct',
    'duplicateRowRatePct',
    'pageCount',
    'lineCount',
    'textBytes',
  ]);
}

test('metadata contract is exact, normalized, enum-bound, and finance requires ARS', () => {
  const normalized = validateSourceIntakeMetadata(validMetadata({
    sourceLabel: '  Ejecucio\u0301n presupuestaria mensual  ',
    ownerOffice: '  Secretaria de Hacienda  ',
  }));
  assert.equal(normalized.sourceLabel, 'Ejecución presupuestaria mensual');
  assert.equal(normalized.ownerOffice, 'Secretaria de Hacienda');
  assert.ok(Object.isFrozen(normalized));

  const nonFinancial = validateSourceIntakeMetadata(validMetadata({
    domain: 'works',
    currency: 'not_applicable',
  }));
  assert.equal(nonFinancial.currency, 'not_applicable');

  const invalidCases = [
    { ...validMetadata(), unexpected: true },
    Object.fromEntries(Object.entries(validMetadata()).filter(([key]) => key !== 'ownerOffice')),
    validMetadata({ domain: 'unknown' }),
    validMetadata({ purpose: 'exploration' }),
    validMetadata({ classification: 'public' }),
    validMetadata({ authority: 'self_asserted' }),
    validMetadata({ currency: 'USD' }),
    validMetadata({ referencePeriod: '2026-13' }),
    validMetadata({ referencePeriod: '07-2026' }),
    validMetadata({ containsPersonalData: 'false' }),
    validMetadata({ ownerOffice: 'Hacienda\u0000Privada' }),
    validMetadata({ currency: 'not_applicable' }),
  ];
  for (const metadata of invalidCases) {
    assert.throws(
      () => validateSourceIntakeMetadata(metadata),
      error => assertProfilerError(error, 'SOURCE_INTAKE_METADATA_INVALID', 400),
    );
  }
});

test('CSV profile reports aggregate null and duplicate rates without leaking content', async () => {
  const content = [
    'persona_secreta,importe_confidencial',
    'ALFA_ULTRASECRETA,',
    'ALFA_ULTRASECRETA,',
    'BETA_ULTRASECRETA,10',
  ].join('\n');
  const filePath = fixture('archivo-ultrasecreto.csv', content);
  const result = await profileSourceIntake({ filePath, extension: '.CSV', metadata: validMetadata() });

  assert.deepEqual(Object.keys(result), ['source', 'file', 'profile', 'quality', 'limits']);
  assert.deepEqual(Object.keys(result.source), [
    'label',
    'domain',
    'referencePeriod',
    'ownerOffice',
    'purpose',
    'classification',
    'authority',
    'currency',
    'containsPersonalData',
  ]);
  assert.equal(result.source.label, 'Ejecucion presupuestaria mensual');
  assert.equal(Object.hasOwn(result.source, 'sourceLabel'), false);
  assert.deepEqual(Object.keys(result.file), ['sha256', 'extension', 'kind', 'sizeBytes']);
  assert.equal(result.file.sha256, sha256(Buffer.from(content)));
  assert.equal(result.file.extension, 'csv');
  assert.equal(result.file.kind, 'structured');
  assert.equal(result.file.sizeBytes, Buffer.byteLength(content));
  assertExactProfileKeys(result.profile);
  assert.equal(result.profile.schemaVersion, SOURCE_INTAKE_PROFILE_SCHEMA_VERSION);
  assert.match(result.profile.schemaDigest, /^[0-9a-f]{64}$/);
  assert.equal(result.profile.rowCount, 3);
  assert.equal(result.profile.columnCount, 2);
  assert.equal(result.profile.emptyCellRatePct, 33.3333);
  assert.equal(result.profile.duplicateRowRatePct, 33.3333);
  assert.deepEqual(
    [result.profile.pageCount, result.profile.lineCount, result.profile.textBytes],
    [null, null, null],
  );
  assert.deepEqual(result.limits.map(limit => limit.code), [
    'original_not_retained',
    'antimalware_not_run',
    'quarantine_not_publication',
  ]);
  assert.ok(result.limits.every(limit => Object.keys(limit).join(',') === 'code,text'));
  assert.equal(result.quality.status, 'blocked');
  assert.equal(result.quality.passedCount, 5);
  assert.equal(result.quality.blockedCount, 2);
  assert.deepEqual(result.quality.checks.filter(check => check.status === 'blocked').map(check => check.code), [
    'original_not_retained',
    'antimalware_not_run',
  ]);
  assert.deepEqual(result.quality.checks.filter(check => check.status === 'passed').map(check => check.code), [
    'metadata_validated',
    'file_within_limit',
    'format_parsed',
    'authority_owner_confirmed',
    'personal_data_not_declared',
  ]);
  for (const check of result.quality.checks) {
    assert.deepEqual(Object.keys(check), ['code', 'status', 'severity', 'label']);
  }

  const serialized = JSON.stringify(result);
  for (const secret of [
    'archivo-ultrasecreto.csv',
    tempRoot,
    'persona_secreta',
    'importe_confidencial',
    'ALFA_ULTRASECRETA',
    'BETA_ULTRASECRETA',
  ]) {
    assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  }
  assert.equal(
    collectKeys(result).some(key => /^(?:filename|headers?|rows?|records?|values?)$/iu.test(key)),
    false,
  );
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.quality.checks));
  assert.ok(Object.isFrozen(result.quality.checks[0]));
  assert.doesNotThrow(() => normalizeProfiledSourceIntake(result));
});

test('unverified authority and declared personal data add high-severity blocks', async () => {
  const result = await profileSourceIntake({
    filePath: fixture('riesgo-agregado.txt', 'contenido reservado'),
    extension: 'txt',
    metadata: validMetadata({
      domain: 'hr',
      authority: 'unverified',
      currency: 'not_applicable',
      containsPersonalData: true,
    }),
  });
  assert.equal(result.quality.status, 'blocked');
  assert.equal(result.quality.passedCount, 3);
  assert.equal(result.quality.blockedCount, 4);
  assert.deepEqual(result.quality.checks.filter(check => check.status === 'blocked').map(check => ({
    code: check.code,
    severity: check.severity,
  })), [
    { code: 'original_not_retained', severity: 'high' },
    { code: 'antimalware_not_run', severity: 'high' },
    { code: 'authority_unverified', severity: 'high' },
    { code: 'personal_data_declared', severity: 'high' },
  ]);
});

test('structured schema digest is deterministic and JSON missing cells remain aggregate-only', async () => {
  const firstContent = JSON.stringify([
    { clave_ultra: 'uno', monto_oculto: null },
    { monto_oculto: 7, indicador_privado: true },
  ]);
  const secondContent = JSON.stringify([
    { indicador_privado: false, monto_oculto: 9 },
    { monto_oculto: null, clave_ultra: 'dos' },
  ]);
  const first = await profileSourceIntake({
    filePath: fixture('primero.json', firstContent),
    extension: 'json',
    metadata: validMetadata(),
  });
  const second = await profileSourceIntake({
    filePath: fixture('segundo.json', secondContent),
    extension: '.json',
    metadata: validMetadata(),
  });

  assert.equal(first.profile.schemaDigest, second.profile.schemaDigest);
  assert.equal(first.profile.rowCount, 2);
  assert.equal(first.profile.columnCount, 3);
  assert.equal(first.profile.emptyCellRatePct, 50);
  assert.equal(first.profile.duplicateRowRatePct, 0);
  assert.doesNotMatch(JSON.stringify(first), /clave_ultra|monto_oculto|indicador_privado|uno/u);
});

test('XLSX and XLS are both profiled as structured sources', async () => {
  for (const bookType of ['xlsx', 'xls']) {
    const filePath = spreadsheetFixture(`fuente.${bookType}`, bookType, [
      ['campo_reservado', 'monto_reservado'],
      ['dato-uno', 10],
      ['dato-dos', null],
    ]);
    const result = await profileSourceIntake({
      filePath,
      extension: bookType,
      metadata: validMetadata(),
    });
    assert.equal(result.file.kind, 'structured');
    assert.equal(result.file.extension, bookType);
    assert.equal(result.profile.rowCount, 2);
    assert.equal(result.profile.columnCount, 2);
    assert.equal(result.profile.emptyCellRatePct, 25);
    assert.equal(result.profile.duplicateRowRatePct, 0);
    assert.doesNotMatch(JSON.stringify(result), /campo_reservado|monto_reservado|dato-uno|dato-dos/u);
  }
});

test('PDF profile retains only page count and extracted text byte count', async () => {
  const secret = 'CONTENIDO_PDF_MUNICIPAL_RESERVADO';
  const result = await profileSourceIntake({
    filePath: pdfFixture('reserva.pdf', secret),
    extension: 'pdf',
    metadata: validMetadata({ domain: 'general', currency: 'not_applicable' }),
  });

  assert.equal(result.file.kind, 'pdf');
  assertExactProfileKeys(result.profile);
  assert.equal(result.profile.schemaDigest, null);
  assert.equal(result.profile.rowCount, null);
  assert.equal(result.profile.columnCount, null);
  assert.equal(result.profile.emptyCellRatePct, null);
  assert.equal(result.profile.duplicateRowRatePct, null);
  assert.equal(result.profile.pageCount, 1);
  assert.equal(result.profile.lineCount, null);
  assert.ok(result.profile.textBytes >= Buffer.byteLength(secret));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secret, 'u'));
});

test('TXT profile counts logical lines and bytes but never returns text', async () => {
  const text = 'LINEA_TXT_PRIVADA_UNO\r\nLINEA_TXT_PRIVADA_DOS\nLINEA_TXT_PRIVADA_TRES\n';
  const buffer = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(text)]);
  const result = await profileSourceIntake({
    filePath: fixture('notas-secretas.txt', buffer),
    extension: '.TXT',
    metadata: validMetadata({ domain: 'general', currency: 'not_applicable' }),
  });

  assert.equal(result.file.kind, 'text');
  assert.equal(result.profile.schemaDigest, null);
  assert.equal(result.profile.lineCount, 3);
  assert.equal(result.profile.textBytes, Buffer.byteLength(text));
  assert.equal(result.profile.pageCount, null);
  assert.doesNotMatch(JSON.stringify(result), /LINEA_TXT_PRIVADA|notas-secretas/u);

  for (const [name, invalid] of [
    ['vacio-logico.txt', ' \r\n\t'],
    ['binario-nulo.txt', Buffer.from([0x41, 0x00, 0x42])],
    ['utf8-invalido.txt', Buffer.from([0xC3, 0x28])],
  ]) {
    await assert.rejects(
      profileSourceIntake({
        filePath: fixture(name, invalid),
        extension: 'txt',
        metadata: validMetadata({ domain: 'general', currency: 'not_applicable' }),
      }),
      error => assertProfilerError(error, 'SOURCE_INTAKE_PARSE_FAILED', 400),
    );
  }
});

test('malformed, empty, unsupported, and oversized inputs fail closed with safe errors', async () => {
  const malformedSecret = 'VALOR_JSON_QUE_NO_DEBE_APARECER';
  await assert.rejects(
    profileSourceIntake({
      filePath: fixture('malformado-secreto.json', `[{"secreto":"${malformedSecret}"`),
      extension: 'json',
      metadata: validMetadata(),
    }),
    error => {
      assertProfilerError(error, 'SOURCE_INTAKE_PARSE_FAILED', 400);
      assert.doesNotMatch(`${error.message} ${error.code}`, /malformado-secreto|VALOR_JSON/u);
      return true;
    },
  );

  await assert.rejects(
    profileSourceIntake({
      filePath: fixture('demasiado-grande.csv', Buffer.alloc(SOURCE_INTAKE_MAX_FILE_BYTES + 1, 0x41)),
      extension: 'csv',
      metadata: validMetadata(),
    }),
    error => assertProfilerError(error, 'SOURCE_INTAKE_FILE_TOO_LARGE', 413),
  );

  await assert.rejects(
    profileSourceIntake({
      filePath: fixture('vacio.csv', Buffer.alloc(0)),
      extension: 'csv',
      metadata: validMetadata(),
    }),
    error => assertProfilerError(error, 'SOURCE_INTAKE_FILE_INVALID', 400),
  );

  await assert.rejects(
    profileSourceIntake({
      filePath: fixture('contenido.zip', 'PK'),
      extension: 'zip',
      metadata: validMetadata(),
    }),
    error => assertProfilerError(error, 'SOURCE_INTAKE_EXTENSION_UNSUPPORTED', 400),
  );

  await assert.rejects(
    profileSourceIntake({ filePath: tempRoot, extension: 'csv', metadata: validMetadata() }),
    error => assertProfilerError(error, 'SOURCE_INTAKE_FILE_INVALID', 400),
  );

  await assert.rejects(
    profileSourceIntake(),
    error => assertProfilerError(error, 'SOURCE_INTAKE_ARGUMENT_INVALID', 400),
  );
  await assert.rejects(
    profileSourceIntake(null),
    error => assertProfilerError(error, 'SOURCE_INTAKE_ARGUMENT_INVALID', 400),
  );
  await assert.rejects(
    profileSourceIntake({
      filePath: fixture('extra.csv', 'campo\nvalor'),
      extension: 'csv',
      metadata: validMetadata(),
      unexpected: true,
    }),
    error => assertProfilerError(error, 'SOURCE_INTAKE_ARGUMENT_INVALID', 400),
  );
});

test('published constants stay pinned to the six formats and 4 MiB cap', () => {
  assert.equal(SOURCE_INTAKE_MAX_FILE_BYTES, 4_194_304);
  assert.deepEqual([...SOURCE_INTAKE_ALLOWED_EXTENSIONS], ['csv', 'xlsx', 'xls', 'json', 'pdf', 'txt']);
  assert.equal(SOURCE_INTAKE_PROFILE_SCHEMA_VERSION, 'municipal-source-intake-profile-v1');
  assert.ok(Object.isFrozen(SOURCE_INTAKE_ALLOWED_EXTENSIONS));
});
