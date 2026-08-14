import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { TextDecoder } from 'node:util';
import { parseUploadFile } from '../upload-handler.js';

export const SOURCE_INTAKE_PROFILE_SCHEMA_VERSION = 'municipal-source-intake-profile-v1';
export const SOURCE_INTAKE_MAX_FILE_BYTES = 4 * 1024 * 1024;
export const SOURCE_INTAKE_ALLOWED_EXTENSIONS = Object.freeze([
  'csv',
  'xlsx',
  'xls',
  'json',
  'pdf',
  'txt',
]);
export const SOURCE_INTAKE_DOMAINS = Object.freeze([
  'budget',
  'purchases',
  'treasury',
  'accounting',
  'hr',
  'works',
  'general',
]);
export const SOURCE_INTAKE_PURPOSES = Object.freeze([
  'operational_analysis',
  'reconciliation',
  'official_reporting',
]);
export const SOURCE_INTAKE_CLASSIFICATIONS = Object.freeze([
  'internal',
  'confidential',
  'restricted',
]);
export const SOURCE_INTAKE_AUTHORITIES = Object.freeze([
  'unverified',
  'owner_confirmed',
]);
export const SOURCE_INTAKE_CURRENCIES = Object.freeze([
  'ARS',
  'not_applicable',
]);

const METADATA_KEYS = Object.freeze([
  'sourceLabel',
  'domain',
  'referencePeriod',
  'ownerOffice',
  'purpose',
  'classification',
  'authority',
  'currency',
  'containsPersonalData',
]);
const FINANCE_DOMAINS = new Set(['budget', 'purchases', 'treasury', 'accounting']);
const EXTENSIONS = new Set(SOURCE_INTAKE_ALLOWED_EXTENSIONS);
const DOMAINS = new Set(SOURCE_INTAKE_DOMAINS);
const PURPOSES = new Set(SOURCE_INTAKE_PURPOSES);
const CLASSIFICATIONS = new Set(SOURCE_INTAKE_CLASSIFICATIONS);
const AUTHORITIES = new Set(SOURCE_INTAKE_AUTHORITIES);
const CURRENCIES = new Set(SOURCE_INTAKE_CURRENCIES);
const STRUCTURED_EXTENSIONS = new Set(['csv', 'xlsx', 'xls', 'json']);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const REFERENCE_PERIOD = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const SHA256_HEX = /^[0-9a-f]{64}$/u;

const ERROR_DEFINITIONS = Object.freeze({
  SOURCE_INTAKE_ARGUMENT_INVALID: Object.freeze({
    message: 'Los argumentos del perfilador no son validos.',
    httpStatus: 400,
  }),
  SOURCE_INTAKE_METADATA_INVALID: Object.freeze({
    message: 'Los metadatos de la fuente no cumplen el contrato.',
    httpStatus: 400,
  }),
  SOURCE_INTAKE_EXTENSION_UNSUPPORTED: Object.freeze({
    message: 'La extension no esta permitida.',
    httpStatus: 400,
  }),
  SOURCE_INTAKE_FILE_INVALID: Object.freeze({
    message: 'El archivo no es valido para perfilado.',
    httpStatus: 400,
  }),
  SOURCE_INTAKE_FILE_TOO_LARGE: Object.freeze({
    message: 'El archivo supera el limite permitido.',
    httpStatus: 413,
  }),
  SOURCE_INTAKE_PARSE_FAILED: Object.freeze({
    message: 'No se pudo obtener un perfil estructural seguro.',
    httpStatus: 400,
  }),
});

export class SourceIntakeProfilerError extends Error {
  constructor(code) {
    const definition = ERROR_DEFINITIONS[code] || ERROR_DEFINITIONS.SOURCE_INTAKE_PARSE_FAILED;
    super(definition.message);
    this.name = 'SourceIntakeProfilerError';
    this.code = ERROR_DEFINITIONS[code] ? code : 'SOURCE_INTAKE_PARSE_FAILED';
    this.httpStatus = definition.httpStatus;
  }
}

function fail(code) {
  throw new SourceIntakeProfilerError(code);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const wantedKeys = [...expectedKeys].sort();
  return actualKeys.length === wantedKeys.length &&
    actualKeys.every((key, index) => key === wantedKeys[index]);
}

function normalizeBoundedText(value, maximumLength) {
  if (typeof value !== 'string') fail('SOURCE_INTAKE_METADATA_INVALID');
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || CONTROL_CHARACTERS.test(normalized) || normalized.length > maximumLength) {
    fail('SOURCE_INTAKE_METADATA_INVALID');
  }
  return normalized;
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

export function validateSourceIntakeMetadata(metadata) {
  if (!hasExactKeys(metadata, METADATA_KEYS)) fail('SOURCE_INTAKE_METADATA_INVALID');

  const source = {
    sourceLabel: normalizeBoundedText(metadata.sourceLabel, 120),
    domain: normalizeBoundedText(metadata.domain, 32),
    referencePeriod: normalizeBoundedText(metadata.referencePeriod, 7),
    ownerOffice: normalizeBoundedText(metadata.ownerOffice, 160),
    purpose: normalizeBoundedText(metadata.purpose, 32),
    classification: normalizeBoundedText(metadata.classification, 32),
    authority: normalizeBoundedText(metadata.authority, 32),
    currency: normalizeBoundedText(metadata.currency, 32),
    containsPersonalData: metadata.containsPersonalData,
  };

  if (!DOMAINS.has(source.domain) || !REFERENCE_PERIOD.test(source.referencePeriod) ||
      !PURPOSES.has(source.purpose) || !CLASSIFICATIONS.has(source.classification) ||
      !AUTHORITIES.has(source.authority) || !CURRENCIES.has(source.currency) ||
      typeof source.containsPersonalData !== 'boolean' ||
      (FINANCE_DOMAINS.has(source.domain) && source.currency !== 'ARS')) {
    fail('SOURCE_INTAKE_METADATA_INVALID');
  }

  return freezeDeep(source);
}

function normalizeExtension(extension) {
  if (typeof extension !== 'string') fail('SOURCE_INTAKE_EXTENSION_UNSUPPORTED');
  const normalized = extension.normalize('NFKC').trim().toLowerCase().replace(/^\./u, '');
  if (!EXTENSIONS.has(normalized)) fail('SOURCE_INTAKE_EXTENSION_UNSUPPORTED');
  return normalized;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readSourceFile(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) fail('SOURCE_INTAKE_ARGUMENT_INVALID');
  try {
    const stats = lstatSync(filePath);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1) {
      fail('SOURCE_INTAKE_FILE_INVALID');
    }
    if (stats.size > SOURCE_INTAKE_MAX_FILE_BYTES) fail('SOURCE_INTAKE_FILE_TOO_LARGE');
    const buffer = readFileSync(filePath);
    if (buffer.byteLength !== stats.size || buffer.byteLength < 1) fail('SOURCE_INTAKE_FILE_INVALID');
    return { buffer, digest: sha256(buffer), sizeBytes: buffer.byteLength };
  } catch (error) {
    if (error instanceof SourceIntakeProfilerError) throw error;
    fail('SOURCE_INTAKE_FILE_INVALID');
  }
}

function assertSourceUnchanged(filePath, initial) {
  try {
    const stats = lstatSync(filePath);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size !== initial.sizeBytes ||
        stats.size > SOURCE_INTAKE_MAX_FILE_BYTES) {
      fail('SOURCE_INTAKE_FILE_INVALID');
    }
    const current = readFileSync(filePath);
    if (sha256(current) !== initial.digest) fail('SOURCE_INTAKE_FILE_INVALID');
  } catch (error) {
    if (error instanceof SourceIntakeProfilerError) throw error;
    fail('SOURCE_INTAKE_FILE_INVALID');
  }
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (typeof value === 'number' && !Number.isFinite(value)) return 'non_finite_number';
  return typeof value;
}

function stableValue(value, seen = new Set()) {
  if (value === null) return ['null'];
  if (value === undefined) return ['undefined'];
  if (typeof value === 'string' || typeof value === 'boolean') return [typeof value, value];
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return ['number', 'NaN'];
    if (value === Infinity) return ['number', 'Infinity'];
    if (value === -Infinity) return ['number', '-Infinity'];
    if (Object.is(value, -0)) return ['number', '-0'];
    return ['number', value];
  }
  if (typeof value === 'bigint') return ['bigint', value.toString(10)];
  if (value instanceof Date) return ['date', Number.isFinite(value.getTime()) ? value.toISOString() : 'invalid'];
  if (Array.isArray(value)) {
    if (seen.has(value)) fail('SOURCE_INTAKE_PARSE_FAILED');
    seen.add(value);
    const result = ['array', value.map(item => stableValue(item, seen))];
    seen.delete(value);
    return result;
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) fail('SOURCE_INTAKE_PARSE_FAILED');
    seen.add(value);
    const result = ['object', Object.keys(value).sort().map(key => [key, stableValue(value[key], seen)])];
    seen.delete(value);
    return result;
  }
  fail('SOURCE_INTAKE_PARSE_FAILED');
}

function stableSerialization(value) {
  return JSON.stringify(stableValue(value));
}

function isEmptyCell(value) {
  return value === null || value === undefined ||
    (typeof value === 'string' && value.trim().length === 0);
}

function percentage(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(4));
}

function structuredProfile(records) {
  if (!Array.isArray(records) || records.length < 1 || records.some(row => !isPlainObject(row))) {
    fail('SOURCE_INTAKE_PARSE_FAILED');
  }

  const columns = [...new Set(records.flatMap(row => Object.keys(row)))].sort();
  if (!columns.length) fail('SOURCE_INTAKE_PARSE_FAILED');

  const schema = columns.map(column => {
    const observedTypes = new Set();
    for (const row of records) {
      observedTypes.add(Object.prototype.hasOwnProperty.call(row, column)
        ? valueType(row[column])
        : 'missing');
    }
    return [column, [...observedTypes].sort()];
  });

  let emptyCells = 0;
  for (const row of records) {
    for (const column of columns) {
      if (!Object.prototype.hasOwnProperty.call(row, column) || isEmptyCell(row[column])) emptyCells += 1;
    }
  }

  const rowDigests = new Map();
  let duplicateRows = 0;
  for (const row of records) {
    const digest = sha256(stableSerialization(row));
    const seenCount = rowDigests.get(digest) || 0;
    if (seenCount > 0) duplicateRows += 1;
    rowDigests.set(digest, seenCount + 1);
  }

  return {
    schemaVersion: SOURCE_INTAKE_PROFILE_SCHEMA_VERSION,
    schemaDigest: sha256(JSON.stringify(schema)),
    rowCount: records.length,
    columnCount: columns.length,
    emptyCellRatePct: percentage(emptyCells, records.length * columns.length),
    duplicateRowRatePct: percentage(duplicateRows, records.length),
    pageCount: null,
    lineCount: null,
    textBytes: null,
  };
}

function pdfProfile(records) {
  const document = Array.isArray(records) && records.length === 1 ? records[0] : null;
  if (!isPlainObject(document) || !Number.isSafeInteger(document.pageCount) || document.pageCount < 1 ||
      typeof document.text !== 'string' || !document.text.trim()) {
    fail('SOURCE_INTAKE_PARSE_FAILED');
  }
  return {
    schemaVersion: SOURCE_INTAKE_PROFILE_SCHEMA_VERSION,
    schemaDigest: null,
    rowCount: null,
    columnCount: null,
    emptyCellRatePct: null,
    duplicateRowRatePct: null,
    pageCount: document.pageCount,
    lineCount: null,
    textBytes: Buffer.byteLength(document.text, 'utf8'),
  };
}

function textProfile(buffer) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    fail('SOURCE_INTAKE_PARSE_FAILED');
  }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  if (!text.trim() || text.includes('\u0000')) fail('SOURCE_INTAKE_PARSE_FAILED');
  const normalizedLines = text.replace(/\r\n?/gu, '\n');
  const lineCount = normalizedLines.endsWith('\n')
    ? normalizedLines.slice(0, -1).split('\n').length
    : normalizedLines.split('\n').length;
  return {
    schemaVersion: SOURCE_INTAKE_PROFILE_SCHEMA_VERSION,
    schemaDigest: null,
    rowCount: null,
    columnCount: null,
    emptyCellRatePct: null,
    duplicateRowRatePct: null,
    pageCount: null,
    lineCount,
    textBytes: Buffer.byteLength(text, 'utf8'),
  };
}

function qualitySummary(source) {
  const checks = [
    { code: 'metadata_validated', status: 'passed', severity: 'info', label: 'Metadatos contractuales validados.' },
    { code: 'file_within_limit', status: 'passed', severity: 'info', label: 'Archivo dentro del limite de 4 MiB.' },
    { code: 'format_parsed', status: 'passed', severity: 'info', label: 'Formato interpretado para perfil estructural.' },
    { code: 'original_not_retained', status: 'blocked', severity: 'high', label: 'El original no se conserva en este flujo.' },
    { code: 'antimalware_not_run', status: 'blocked', severity: 'high', label: 'No se ejecuto un control antimalware.' },
    source.authority === 'owner_confirmed'
      ? { code: 'authority_owner_confirmed', status: 'passed', severity: 'info', label: 'La oficina responsable confirmo la autoridad de la fuente.' }
      : { code: 'authority_unverified', status: 'blocked', severity: 'high', label: 'La autoridad de la fuente no fue verificada.' },
    source.containsPersonalData
      ? { code: 'personal_data_declared', status: 'blocked', severity: 'high', label: 'La fuente declara contenido de datos personales.' }
      : { code: 'personal_data_not_declared', status: 'passed', severity: 'info', label: 'La fuente no declara contenido de datos personales.' },
  ];
  return {
    status: 'blocked',
    checks,
    passedCount: checks.filter(check => check.status === 'passed').length,
    blockedCount: checks.filter(check => check.status === 'blocked').length,
  };
}

function kindForExtension(extension) {
  if (STRUCTURED_EXTENSIONS.has(extension)) return 'structured';
  return extension === 'pdf' ? 'pdf' : 'text';
}

export async function profileSourceIntake(input) {
  if (!hasExactKeys(input, ['filePath', 'extension', 'metadata'])) {
    fail('SOURCE_INTAKE_ARGUMENT_INVALID');
  }
  const { filePath, extension, metadata } = input;
  const source = validateSourceIntakeMetadata(metadata);
  const normalizedExtension = normalizeExtension(extension);
  const initial = readSourceFile(filePath);

  let profile;
  try {
    if (normalizedExtension === 'txt') {
      profile = textProfile(initial.buffer);
    } else {
      const parsed = await parseUploadFile(filePath, `.${normalizedExtension}`);
      profile = normalizedExtension === 'pdf'
        ? pdfProfile(parsed?.records)
        : structuredProfile(parsed?.records);
      assertSourceUnchanged(filePath, initial);
    }
  } catch (error) {
    if (error instanceof SourceIntakeProfilerError) throw error;
    fail('SOURCE_INTAKE_PARSE_FAILED');
  }

  if (!SHA256_HEX.test(initial.digest)) fail('SOURCE_INTAKE_PARSE_FAILED');
  const { sourceLabel, ...sourceMetadata } = source;
  return freezeDeep({
    source: {
      label: sourceLabel,
      ...sourceMetadata,
    },
    file: {
      sha256: initial.digest,
      extension: normalizedExtension,
      kind: kindForExtension(normalizedExtension),
      sizeBytes: initial.sizeBytes,
    },
    profile,
    quality: qualitySummary(source),
    limits: [
      {
        code: 'original_not_retained',
        text: 'El archivo original no se conserva en este flujo.',
      },
      {
        code: 'antimalware_not_run',
        text: 'El archivo no fue sometido a un control antimalware.',
      },
      {
        code: 'quarantine_not_publication',
        text: 'La cuarentena no aprueba, publica ni incorpora los datos a la plataforma.',
      },
    ],
  });
}
