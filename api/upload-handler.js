import fs from 'fs';
import { inflateRawSync } from 'node:zlib';
import Papa from 'papaparse';
import * as xlsx from 'xlsx';
import { noStore, requireDatasetTenant, requireRole } from './lib/auth.js';
const IMPORT_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN'];
const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls', '.pdf', '.json']);
const MAX_STORED_ROWS = 500;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_SOURCE_ROWS = 5000;
const MAX_SOURCE_COLUMNS = 200;
const MAX_WORKBOOK_SHEETS = 20;
const MAX_WORKSHEET_CELLS = 250000;
const MAX_WORKBOOK_CELLS = 1000000;
const MAX_ZIP_ENTRIES = 2048;
const MAX_ZIP_COMPRESSED_BYTES = MAX_FILE_BYTES;
const MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_COMPRESSION_RATIO = 100;
const MAX_ZIP_ENTRY_NAME_BYTES = 1024;
const MAX_HEADER_BYTES = 128;
const MAX_RECORD_BYTES = 256 * 1024;
const MAX_PARSED_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 250;
const DANGEROUS_HEADER_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export const UPLOAD_LIMITS = Object.freeze({
  maxFileBytes: MAX_FILE_BYTES,
  maxSourceRows: MAX_SOURCE_ROWS,
  maxSourceColumns: MAX_SOURCE_COLUMNS,
  maxWorkbookSheets: MAX_WORKBOOK_SHEETS,
  maxWorksheetCells: MAX_WORKSHEET_CELLS,
  maxWorkbookCells: MAX_WORKBOOK_CELLS,
  maxZipEntries: MAX_ZIP_ENTRIES,
  maxZipCompressedBytes: MAX_ZIP_COMPRESSED_BYTES,
  maxZipEntryUncompressedBytes: MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES,
  maxZipUncompressedBytes: MAX_ZIP_UNCOMPRESSED_BYTES,
  maxZipCompressionRatio: MAX_ZIP_COMPRESSION_RATIO,
  maxZipEntryNameBytes: MAX_ZIP_ENTRY_NAME_BYTES,
  maxHeaderBytes: MAX_HEADER_BYTES,
  maxRecordBytes: MAX_RECORD_BYTES,
  maxParsedBytes: MAX_PARSED_BYTES,
  maxPdfPages: MAX_PDF_PAGES,
  maxStoredRows: MAX_STORED_ROWS,
});

export const config = {
  api: {
    bodyParser: false,
  },
};

export function createLegacyUploadRetirementHandler({
  requireRoleImpl = requireRole,
  requireDatasetTenantImpl = requireDatasetTenant,
} = {}) {
  return async function handler(req, res) {
    noStore(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
    }

    const caller = await requireRoleImpl(req, res, IMPORT_ROLES);
    if (!caller || !requireDatasetTenantImpl(res, caller, 'LEGACY_ANALYTICS_TENANT_ID')) return;

    return res.status(410).json({
      success: false,
      parsed: false,
      persisted: false,
      code: 'LEGACY_UPLOAD_IMPORT_RETIRED',
      error: 'La carga legacy fue retirada. Use el ingreso gobernado en cuarentena.',
      replacement: '/api/source-intake',
    });
  };
}
export default createLegacyUploadRetirementHandler();

export async function parseUploadFile(filepath, ext) {
  const normalizedExt = String(ext || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(normalizedExt)) {
    throw new Error('Tipo de archivo no permitido');
  }
  assertReadableFile(filepath);

  let parsed;

  if (normalizedExt === '.csv') {
    parsed = parseCSV(filepath);
  } else if (normalizedExt === '.xlsx' || normalizedExt === '.xls') {
    parsed = parseExcel(filepath, normalizedExt);
  } else if (normalizedExt === '.pdf') {
    parsed = [await parsePDF(filepath)];
  } else if (normalizedExt === '.json') {
    const raw = fs.readFileSync(filepath, 'utf8');
    const json = JSON.parse(raw);
    parsed = Array.isArray(json) ? json : [json];
  }

  validateParsedRecords(parsed);

  return { records: parsed, sourceRowCount: parsed.length };
}

function assertReadableFile(filepath) {
  const stats = fs.statSync(filepath);
  if (!stats.isFile() || stats.size < 1) throw new Error('El archivo está vacío');
  if (stats.size > MAX_FILE_BYTES) throw new Error('El archivo excede el límite permitido');
}

function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf8').replace(/^\uFEFF/, '');
  let headers = null;
  let parseError = null;
  let tooManyRows = false;
  const records = [];

  Papa.parse(content, {
    header: false,
    skipEmptyLines: 'greedy',
    step(result, parser) {
      if (result.errors?.length) {
        parseError = result.errors[0];
        parser.abort();
        return;
      }

      const values = Array.isArray(result.data) ? result.data : [result.data];
      if (!headers) {
        try {
          headers = validateHeaders(values, 'CSV');
        } catch (error) {
          parseError = error;
          parser.abort();
        }
        return;
      }

      if (records.length >= MAX_SOURCE_ROWS) {
        tooManyRows = true;
        parser.abort();
        return;
      }
      if (values.length > headers.length) {
        parseError = new Error('El CSV contiene filas con más columnas que el encabezado');
        parser.abort();
        return;
      }

      records.push(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
    },
  });

  if (parseError) {
    const detail = parseError.code || parseError.message || 'estructura inválida';
    throw new Error(`CSV inválido: ${detail}`);
  }
  if (tooManyRows) throw new Error(`El CSV supera el límite de ${MAX_SOURCE_ROWS} filas`);
  if (!headers || !records.length) throw new Error('El CSV no contiene filas de datos');
  return records;
}

function parseExcel(filepath, ext) {
  const buffer = fs.readFileSync(filepath);
  assertSpreadsheetSignature(buffer, ext);
  if (ext === '.xlsx') preflightXlsxContainer(buffer);
  else preflightXlsContainer(buffer);

  const wb = xlsx.read(buffer, {
    type: 'buffer',
    dense: true,
    cellFormula: false,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    bookVBA: false,
  });
  const sheet = validateWorkbookSheets(wb);

  // El contrato de importación toma datos sólo de la primera hoja. Las demás
  // se validan arriba para que no puedan ocultar rangos o celdas no acotados.
  const matrix = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true,
  });
  if (matrix.length < 2) throw new Error('La hoja no contiene filas de datos');
  const headers = validateHeaders(matrix[0], 'Excel');
  return matrix.slice(1).map((values, rowIndex) => {
    if (!Array.isArray(values)) throw new Error(`La fila ${rowIndex + 2} no es válida`);
    if (values.length > headers.length) {
      throw new Error(`La fila ${rowIndex + 2} contiene más columnas que el encabezado`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? null]));
  });
}

function validateWorkbookSheets(workbook) {
  if (!Array.isArray(workbook?.SheetNames) || workbook.SheetNames.length === 0) {
    throw new Error('El libro no contiene hojas');
  }
  if (workbook.SheetNames.length > MAX_WORKBOOK_SHEETS) {
    throw new Error(`El libro supera el límite de ${MAX_WORKBOOK_SHEETS} hojas`);
  }

  let workbookCells = 0;
  let firstSheet = null;

  for (let sheetIndex = 0; sheetIndex < workbook.SheetNames.length; sheetIndex += 1) {
    const sheetName = workbook.SheetNames[sheetIndex];
    const sheet = workbook.Sheets?.[sheetName];
    if (!sheet || typeof sheet !== 'object') {
      throw new Error(`La hoja ${sheetIndex + 1} no es válida`);
    }
    if (sheetIndex === 0) firstSheet = sheet;

    const reference = sheet['!ref'];
    if (!reference) {
      if (sheetIndex === 0) throw new Error('La primera hoja está vacía');
      continue;
    }

    let range;
    try {
      range = xlsx.utils.decode_range(reference);
    } catch {
      throw new Error(`La hoja ${sheetIndex + 1} contiene un rango inválido`);
    }
    const coordinates = [range?.s?.r, range?.s?.c, range?.e?.r, range?.e?.c];
    if (coordinates.some(value => !Number.isSafeInteger(value) || value < 0) ||
        range.e.r < range.s.r || range.e.c < range.s.c) {
      throw new Error(`La hoja ${sheetIndex + 1} contiene un rango inválido`);
    }

    const rowCount = range.e.r - range.s.r + 1;
    const columnCount = range.e.c - range.s.c + 1;
    const dataRowCount = Math.max(0, rowCount - 1);
    const declaredCells = rowCount * columnCount;
    if (!Number.isSafeInteger(declaredCells)) {
      throw new Error(`La hoja ${sheetIndex + 1} contiene un rango inválido`);
    }
    if (columnCount > MAX_SOURCE_COLUMNS) {
      throw new Error(`La hoja ${sheetIndex + 1} supera el límite de ${MAX_SOURCE_COLUMNS} columnas`);
    }
    if (dataRowCount > MAX_SOURCE_ROWS) {
      throw new Error(`La hoja ${sheetIndex + 1} supera el límite de ${MAX_SOURCE_ROWS} filas`);
    }
    if (declaredCells > MAX_WORKSHEET_CELLS) {
      throw new Error(`La hoja ${sheetIndex + 1} supera el límite de ${MAX_WORKSHEET_CELLS} celdas`);
    }
    workbookCells += declaredCells;
    if (workbookCells > MAX_WORKBOOK_CELLS) {
      throw new Error(`El libro supera el límite de ${MAX_WORKBOOK_CELLS} celdas declaradas`);
    }

    validateSheetCells(sheet, range, sheetIndex);
  }

  return firstSheet;
}

function validateSheetCells(sheet, range, sheetIndex) {
  const denseRows = sheet['!data'];
  let populatedCells = 0;

  if (denseRows !== undefined && !Array.isArray(denseRows)) {
    throw new Error(`La hoja ${sheetIndex + 1} contiene celdas inválidas`);
  }
  if (Array.isArray(denseRows)) {
    for (let rowIndex = 0; rowIndex < denseRows.length; rowIndex += 1) {
      const row = denseRows[rowIndex];
      if (row === undefined) continue;
      if (!Array.isArray(row)) {
        throw new Error(`La hoja ${sheetIndex + 1} contiene celdas inválidas`);
      }
      for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
        if (row[columnIndex] === undefined) continue;
        if (rowIndex < range.s.r || rowIndex > range.e.r ||
            columnIndex < range.s.c || columnIndex > range.e.c) {
          throw new Error(`La hoja ${sheetIndex + 1} contiene celdas fuera de su rango`);
        }
        populatedCells += 1;
        if (populatedCells > MAX_WORKSHEET_CELLS) {
          throw new Error(`La hoja ${sheetIndex + 1} supera el límite de ${MAX_WORKSHEET_CELLS} celdas`);
        }
      }
    }
    return;
  }

  for (const key of Object.keys(sheet)) {
    if (key.startsWith('!')) continue;
    let cell;
    try {
      cell = xlsx.utils.decode_cell(key);
    } catch {
      throw new Error(`La hoja ${sheetIndex + 1} contiene una celda inválida`);
    }
    if (cell.r < range.s.r || cell.r > range.e.r || cell.c < range.s.c || cell.c > range.e.c) {
      throw new Error(`La hoja ${sheetIndex + 1} contiene celdas fuera de su rango`);
    }
    populatedCells += 1;
    if (populatedCells > MAX_WORKSHEET_CELLS) {
      throw new Error(`La hoja ${sheetIndex + 1} supera el límite de ${MAX_WORKSHEET_CELLS} celdas`);
    }
  }
}

function assertSpreadsheetSignature(buffer, ext) {
  const zipSignatures = [[0x03, 0x04], [0x05, 0x06], [0x07, 0x08]];
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B &&
    zipSignatures.some(([third, fourth]) => buffer[2] === third && buffer[3] === fourth);
  const oleSignature = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
  const isOle = buffer.length >= oleSignature.length &&
    oleSignature.every((byte, index) => buffer[index] === byte);

  if ((ext === '.xlsx' && !isZip) || (ext === '.xls' && !isOle)) {
    throw new Error('La firma del archivo no coincide con el formato declarado');
  }
}

function preflightXlsxContainer(buffer) {
  const eocdOffset = findZipEndOfCentralDirectory(buffer);
  if (eocdOffset >= 20 && buffer.readUInt32LE(eocdOffset - 20) === 0x07064B50) {
    throw new Error('El XLSX usa ZIP64, formato no permitido para importación');
  }

  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error('El XLSX usa un ZIP dividido en múltiples discos');
  }
  if (entryCount === 0 || entryCount === 0xFFFF ||
      centralDirectorySize === 0xFFFFFFFF || centralDirectoryOffset === 0xFFFFFFFF) {
    throw new Error('El XLSX contiene metadatos ZIP64 o vacíos no permitidos');
  }
  if (entryCount > MAX_ZIP_ENTRIES) {
    throw new Error(`El XLSX supera el límite de ${MAX_ZIP_ENTRIES} entradas ZIP`);
  }

  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (!Number.isSafeInteger(centralDirectoryEnd) || centralDirectoryOffset < 0 ||
      centralDirectoryEnd !== eocdOffset) {
    throw new Error('El XLSX contiene un directorio ZIP inconsistente');
  }

  const entries = [];
  const normalizedPaths = new Set();
  let cursor = centralDirectoryOffset;
  let totalCompressedBytes = 0;
  let totalUncompressedBytes = 0;

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (cursor + 46 > centralDirectoryEnd || buffer.readUInt32LE(cursor) !== 0x02014B50) {
      throw new Error('El XLSX contiene una entrada central ZIP inválida');
    }

    const versionMadeBy = buffer.readUInt16LE(cursor + 4);
    const flags = buffer.readUInt16LE(cursor + 8);
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const diskStart = buffer.readUInt16LE(cursor + 34);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const entryEnd = cursor + 46 + nameLength + extraLength + commentLength;

    if (entryEnd > centralDirectoryEnd || nameLength === 0 || nameLength > MAX_ZIP_ENTRY_NAME_BYTES) {
      throw new Error('El XLSX contiene una entrada ZIP truncada o con nombre inválido');
    }
    if (diskStart !== 0 || localHeaderOffset === 0xFFFFFFFF ||
        compressedSize === 0xFFFFFFFF || uncompressedSize === 0xFFFFFFFF) {
      throw new Error('El XLSX contiene una entrada ZIP64 no permitida');
    }
    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0 || (flags & 0x2000) !== 0) {
      throw new Error('El XLSX contiene una entrada ZIP cifrada no permitida');
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new Error('El XLSX usa un método de compresión ZIP no permitido');
    }
    if (uncompressedSize > MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES) {
      throw new Error(`Una entrada XLSX supera el límite de ${MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES} bytes descomprimidos`);
    }
    if (uncompressedSize > 0 && compressedSize === 0) {
      throw new Error('El XLSX declara una entrada ZIP imposible de descomprimir');
    }
    if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_ZIP_COMPRESSION_RATIO) {
      throw new Error(`Una entrada XLSX supera la relación de compresión ${MAX_ZIP_COMPRESSION_RATIO}:1`);
    }

    totalCompressedBytes += compressedSize;
    totalUncompressedBytes += uncompressedSize;
    if (!Number.isSafeInteger(totalCompressedBytes) || totalCompressedBytes > MAX_ZIP_COMPRESSED_BYTES) {
      throw new Error(`El XLSX supera el límite de ${MAX_ZIP_COMPRESSED_BYTES} bytes comprimidos`);
    }
    if (!Number.isSafeInteger(totalUncompressedBytes) || totalUncompressedBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
      throw new Error(`El XLSX supera el límite de ${MAX_ZIP_UNCOMPRESSED_BYTES} bytes descomprimidos`);
    }

    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const entryName = nameBytes.toString('utf8');
    const normalizedPath = validateZipEntryPath(entryName);
    if (normalizedPaths.has(normalizedPath)) {
      throw new Error('El XLSX contiene rutas ZIP duplicadas o ambiguas');
    }
    normalizedPaths.add(normalizedPath);

    const hostSystem = versionMadeBy >>> 8;
    const unixFileType = (externalAttributes >>> 16) & 0xF000;
    if (hostSystem === 3 && unixFileType === 0xA000) {
      throw new Error('El XLSX contiene un enlace simbólico ZIP no permitido');
    }

    const centralExtra = buffer.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength);
    validateZipExtraFields(centralExtra);
    entries.push({
      compressedSize,
      compressionMethod,
      crc,
      flags,
      localHeaderOffset,
      nameBytes,
      uncompressedSize,
    });
    cursor = entryEnd;
  }

  if (cursor !== centralDirectoryEnd) {
    throw new Error('El XLSX contiene datos centrales ZIP inesperados');
  }
  if (totalUncompressedBytes > 0 && totalCompressedBytes === 0) {
    throw new Error('El XLSX declara tamaños ZIP inconsistentes');
  }
  if (totalCompressedBytes > 0 &&
      totalUncompressedBytes / totalCompressedBytes > MAX_ZIP_COMPRESSION_RATIO) {
    throw new Error(`El XLSX supera la relación de compresión total ${MAX_ZIP_COMPRESSION_RATIO}:1`);
  }

  const occupiedRanges = [];
  for (const entry of entries) {
    const range = validateZipLocalEntry(buffer, entry, centralDirectoryOffset);
    occupiedRanges.push(range);
  }
  occupiedRanges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < occupiedRanges.length; index += 1) {
    if (occupiedRanges[index].start < occupiedRanges[index - 1].end) {
      throw new Error('El XLSX contiene entradas ZIP superpuestas');
    }
  }
}

function findZipEndOfCentralDirectory(buffer) {
  if (buffer.length < 22) throw new Error('El XLSX contiene un ZIP truncado');
  const minimumOffset = Math.max(0, buffer.length - 22 - 0xFFFF);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== 0x06054B50) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  throw new Error('El XLSX no contiene un directorio ZIP completo');
}

function validateZipEntryPath(entryName) {
  if (!entryName || entryName.includes('\u0000') || entryName.includes('\uFFFD') ||
      entryName.includes('\\') || entryName.startsWith('/') || /^[a-zA-Z]:/.test(entryName)) {
    throw new Error('El XLSX contiene una ruta ZIP no permitida');
  }
  const normalized = entryName.normalize('NFKC');
  const segments = normalized.split('/');
  const isDirectory = normalized.endsWith('/');
  const meaningfulSegments = isDirectory ? segments.slice(0, -1) : segments;
  if (!meaningfulSegments.length || meaningfulSegments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('El XLSX contiene una ruta ZIP ambigua');
  }
  return normalized.toLowerCase();
}

function validateZipExtraFields(extra) {
  let cursor = 0;
  while (cursor < extra.length) {
    if (cursor + 4 > extra.length) throw new Error('El XLSX contiene metadatos extra ZIP truncados');
    const fieldId = extra.readUInt16LE(cursor);
    const fieldLength = extra.readUInt16LE(cursor + 2);
    cursor += 4;
    if (cursor + fieldLength > extra.length) throw new Error('El XLSX contiene metadatos extra ZIP inválidos');
    if (fieldId === 0x0001) throw new Error('El XLSX contiene metadatos ZIP64 no permitidos');
    if (fieldId === 0x9901) throw new Error('El XLSX contiene metadatos de cifrado ZIP no permitidos');
    cursor += fieldLength;
  }
}

function validateZipLocalEntry(buffer, entry, centralDirectoryOffset) {
  const offset = entry.localHeaderOffset;
  if (offset < 0 || offset + 30 > centralDirectoryOffset || buffer.readUInt32LE(offset) !== 0x04034B50) {
    throw new Error('El XLSX contiene una cabecera local ZIP inválida');
  }

  const localFlags = buffer.readUInt16LE(offset + 6);
  const localMethod = buffer.readUInt16LE(offset + 8);
  const localCrc = buffer.readUInt32LE(offset + 14);
  const localCompressedSize = buffer.readUInt32LE(offset + 18);
  const localUncompressedSize = buffer.readUInt32LE(offset + 22);
  const localNameLength = buffer.readUInt16LE(offset + 26);
  const localExtraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + entry.compressedSize;

  if (localFlags !== entry.flags || localMethod !== entry.compressionMethod || dataEnd > centralDirectoryOffset) {
    throw new Error('El XLSX contiene metadatos locales ZIP inconsistentes');
  }
  const localName = buffer.subarray(offset + 30, offset + 30 + localNameLength);
  if (localNameLength !== entry.nameBytes.length || !localName.equals(entry.nameBytes)) {
    throw new Error('El XLSX contiene nombres ZIP locales inconsistentes');
  }
  const localExtra = buffer.subarray(offset + 30 + localNameLength, dataStart);
  validateZipExtraFields(localExtra);

  const usesDataDescriptor = (entry.flags & 0x0008) !== 0;
  if (!usesDataDescriptor &&
      (localCrc !== entry.crc || localCompressedSize !== entry.compressedSize ||
       localUncompressedSize !== entry.uncompressedSize)) {
    throw new Error('El XLSX contiene tamaños ZIP locales inconsistentes');
  }

  let rangeEnd = dataEnd;
  if (usesDataDescriptor) {
    rangeEnd = validateZipDataDescriptor(buffer, dataEnd, entry, centralDirectoryOffset);
  }

  const compressedData = buffer.subarray(dataStart, dataEnd);
  let uncompressedData;
  try {
    if (entry.compressionMethod === 0) {
      if (entry.compressedSize !== entry.uncompressedSize) {
        throw new Error('stored-size-mismatch');
      }
      uncompressedData = compressedData;
    } else {
      uncompressedData = inflateRawSync(compressedData, {
        maxOutputLength: Math.max(1, entry.uncompressedSize + 1),
      });
    }
  } catch {
    throw new Error('El XLSX contiene una entrada ZIP que no puede descomprimirse dentro de los límites');
  }
  if (uncompressedData.length !== entry.uncompressedSize || crc32(uncompressedData) !== entry.crc) {
    throw new Error('El XLSX contiene tamaños o integridad ZIP inconsistentes');
  }

  return { start: offset, end: rangeEnd };
}

function validateZipDataDescriptor(buffer, offset, entry, boundary) {
  let cursor = offset;
  if (cursor + 4 <= boundary && buffer.readUInt32LE(cursor) === 0x08074B50) cursor += 4;
  if (cursor + 12 > boundary) throw new Error('El XLSX contiene un descriptor ZIP truncado');
  const crc = buffer.readUInt32LE(cursor);
  const compressedSize = buffer.readUInt32LE(cursor + 4);
  const uncompressedSize = buffer.readUInt32LE(cursor + 8);
  if (crc !== entry.crc || compressedSize !== entry.compressedSize ||
      uncompressedSize !== entry.uncompressedSize) {
    throw new Error('El XLSX contiene un descriptor ZIP inconsistente');
  }
  return cursor + 12;
}

let crc32Table;
function crc32(buffer) {
  if (!crc32Table) {
    crc32Table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) !== 0 ? (value >>> 1) ^ 0xEDB88320 : value >>> 1;
      }
      crc32Table[index] = value >>> 0;
    }
  }
  let value = 0xFFFFFFFF;
  for (const byte of buffer) value = (value >>> 8) ^ crc32Table[(value ^ byte) & 0xFF];
  return (value ^ 0xFFFFFFFF) >>> 0;
}

function preflightXlsContainer(buffer) {
  const FREE_SECTOR = 0xFFFFFFFF;
  const END_OF_CHAIN = 0xFFFFFFFE;
  const FAT_SECTOR = 0xFFFFFFFD;
  const DIFAT_SECTOR = 0xFFFFFFFC;
  const specialSectors = new Set([FREE_SECTOR, END_OF_CHAIN, FAT_SECTOR, DIFAT_SECTOR]);

  if (buffer.length < 512) throw new Error('El XLS contiene un contenedor OLE truncado');
  const majorVersion = buffer.readUInt16LE(0x1A);
  const byteOrder = buffer.readUInt16LE(0x1C);
  const sectorShift = buffer.readUInt16LE(0x1E);
  const miniSectorShift = buffer.readUInt16LE(0x20);
  if ((majorVersion !== 3 && majorVersion !== 4) || byteOrder !== 0xFFFE ||
      (majorVersion === 3 && sectorShift !== 9) || (majorVersion === 4 && sectorShift !== 12) ||
      miniSectorShift !== 6) {
    throw new Error('El XLS contiene una cabecera OLE no permitida');
  }

  const sectorSize = 2 ** sectorShift;
  const miniSectorSize = 2 ** miniSectorShift;
  if (buffer.length < sectorSize || buffer.length % sectorSize !== 0) {
    throw new Error('El XLS contiene sectores OLE truncados');
  }
  const sectorCount = (buffer.length / sectorSize) - 1;
  const directorySectorCount = buffer.readUInt32LE(0x28);
  const fatSectorCount = buffer.readUInt32LE(0x2C);
  const firstDirectorySector = buffer.readUInt32LE(0x30);
  const miniStreamCutoff = buffer.readUInt32LE(0x38);
  const firstMiniFatSector = buffer.readUInt32LE(0x3C);
  const miniFatSectorCount = buffer.readUInt32LE(0x40);
  const firstDifatSector = buffer.readUInt32LE(0x44);
  const difatSectorCount = buffer.readUInt32LE(0x48);

  if (sectorCount < 1 || fatSectorCount < 1 || fatSectorCount > sectorCount ||
      miniFatSectorCount > sectorCount || difatSectorCount > sectorCount ||
      directorySectorCount > sectorCount || miniStreamCutoff !== 4096 ||
      (majorVersion === 3 && directorySectorCount !== 0)) {
    throw new Error('El XLS declara cantidades de sectores OLE inválidas');
  }

  const assertRegularSector = (sectorId, label) => {
    if (!Number.isInteger(sectorId) || sectorId < 0 || sectorId >= sectorCount) {
      throw new Error(`El XLS contiene un sector OLE inválido (${label})`);
    }
  };

  const fatSectors = [];
  const fatSectorSet = new Set();
  const addFatSector = sectorId => {
    if (sectorId === FREE_SECTOR) return;
    assertRegularSector(sectorId, 'FAT');
    if (fatSectorSet.has(sectorId)) throw new Error('El XLS contiene sectores FAT duplicados');
    fatSectorSet.add(sectorId);
    fatSectors.push(sectorId);
  };
  for (let index = 0; index < 109; index += 1) addFatSector(buffer.readUInt32LE(0x4C + index * 4));
  if (fatSectors.length > fatSectorCount) throw new Error('El XLS declara una tabla FAT inconsistente');

  const difatSectors = [];
  const difatSectorSet = new Set();
  let nextDifatSector = firstDifatSector;
  const difatEntriesPerSector = (sectorSize / 4) - 1;
  for (let index = 0; index < difatSectorCount; index += 1) {
    assertRegularSector(nextDifatSector, 'DIFAT');
    if (difatSectorSet.has(nextDifatSector) || fatSectorSet.has(nextDifatSector)) {
      throw new Error('El XLS contiene una cadena DIFAT cíclica o superpuesta');
    }
    difatSectorSet.add(nextDifatSector);
    difatSectors.push(nextDifatSector);
    const sectorOffset = (nextDifatSector + 1) * sectorSize;
    for (let entryIndex = 0; entryIndex < difatEntriesPerSector; entryIndex += 1) {
      addFatSector(buffer.readUInt32LE(sectorOffset + entryIndex * 4));
    }
    nextDifatSector = buffer.readUInt32LE(sectorOffset + difatEntriesPerSector * 4);
  }
  if ((difatSectorCount === 0 && firstDifatSector !== END_OF_CHAIN && firstDifatSector !== FREE_SECTOR) ||
      (difatSectorCount > 0 && nextDifatSector !== END_OF_CHAIN) || fatSectors.length !== fatSectorCount) {
    throw new Error('El XLS declara una cadena DIFAT inconsistente');
  }

  const fat = [];
  for (const fatSector of fatSectors) {
    const sectorOffset = (fatSector + 1) * sectorSize;
    for (let offset = 0; offset < sectorSize; offset += 4) fat.push(buffer.readUInt32LE(sectorOffset + offset));
  }
  if (fat.length < sectorCount) throw new Error('El XLS contiene una tabla FAT truncada');
  for (let sectorId = 0; sectorId < sectorCount; sectorId += 1) {
    const nextSector = fat[sectorId];
    if (!specialSectors.has(nextSector) && nextSector >= sectorCount) {
      throw new Error('El XLS contiene referencias FAT fuera del archivo');
    }
  }
  for (const sectorId of fatSectors) {
    if (fat[sectorId] !== FAT_SECTOR) throw new Error('El XLS contiene marcadores FAT inconsistentes');
  }
  for (const sectorId of difatSectors) {
    if (fat[sectorId] !== DIFAT_SECTOR) throw new Error('El XLS contiene marcadores DIFAT inconsistentes');
  }

  const walkFatChain = (startSector, label, expectedSectors = null) => {
    const chain = [];
    const seen = new Set();
    let sectorId = startSector;
    while (sectorId !== END_OF_CHAIN) {
      assertRegularSector(sectorId, label);
      if (seen.has(sectorId)) throw new Error(`El XLS contiene una cadena OLE cíclica (${label})`);
      seen.add(sectorId);
      chain.push(sectorId);
      if (chain.length > sectorCount) throw new Error(`El XLS contiene una cadena OLE excesiva (${label})`);
      const nextSector = fat[sectorId];
      if (nextSector === FREE_SECTOR || nextSector === FAT_SECTOR || nextSector === DIFAT_SECTOR) {
        throw new Error(`El XLS contiene una cadena OLE inválida (${label})`);
      }
      sectorId = nextSector;
    }
    if (expectedSectors !== null && chain.length !== expectedSectors) {
      throw new Error(`El XLS contiene una cadena OLE con tamaño inconsistente (${label})`);
    }
    return chain;
  };

  assertRegularSector(firstDirectorySector, 'directorio');
  const directoryChain = walkFatChain(
    firstDirectorySector,
    'directorio',
    majorVersion === 4 ? directorySectorCount : null
  );
  if (directoryChain.length === 0) throw new Error('El XLS no contiene directorio OLE');

  let miniFatChain = [];
  if (miniFatSectorCount === 0) {
    if (firstMiniFatSector !== END_OF_CHAIN && firstMiniFatSector !== FREE_SECTOR) {
      throw new Error('El XLS declara una miniFAT inconsistente');
    }
  } else {
    miniFatChain = walkFatChain(firstMiniFatSector, 'miniFAT', miniFatSectorCount);
  }

  const directoryBuffer = Buffer.concat(directoryChain.map(sectorId => {
    const offset = (sectorId + 1) * sectorSize;
    return buffer.subarray(offset, offset + sectorSize);
  }));
  const directoryEntries = [];
  let rootEntry = null;
  for (let offset = 0; offset + 128 <= directoryBuffer.length; offset += 128) {
    const objectType = directoryBuffer[offset + 66];
    if (objectType === 0) continue;
    if (objectType !== 1 && objectType !== 2 && objectType !== 5) {
      throw new Error('El XLS contiene una entrada de directorio OLE inválida');
    }
    const nameLength = directoryBuffer.readUInt16LE(offset + 64);
    if (nameLength < 2 || nameLength > 64 || nameLength % 2 !== 0) {
      throw new Error('El XLS contiene un nombre de directorio OLE inválido');
    }
    const startSector = directoryBuffer.readUInt32LE(offset + 116);
    const streamSize = directoryBuffer.readBigUInt64LE(offset + 120);
    if (streamSize > BigInt(buffer.length)) {
      throw new Error('El XLS declara un flujo OLE mayor que el archivo');
    }
    const entry = { objectType, startSector, streamSize: Number(streamSize) };
    directoryEntries.push(entry);
    if (objectType === 5) {
      if (rootEntry) throw new Error('El XLS contiene múltiples raíces OLE');
      rootEntry = entry;
    }
  }
  if (!rootEntry) throw new Error('El XLS no contiene una raíz OLE');

  const validateRegularStream = (entry, label) => {
    if (entry.streamSize === 0) {
      if (entry.startSector !== END_OF_CHAIN && entry.startSector !== FREE_SECTOR) {
        throw new Error(`El XLS contiene un flujo OLE vacío inconsistente (${label})`);
      }
      return [];
    }
    return walkFatChain(entry.startSector, label, Math.ceil(entry.streamSize / sectorSize));
  };
  const rootMiniStreamChain = validateRegularStream(rootEntry, 'mini stream raíz');

  const miniFat = [];
  for (const sectorId of miniFatChain) {
    const offset = (sectorId + 1) * sectorSize;
    for (let itemOffset = 0; itemOffset < sectorSize; itemOffset += 4) {
      miniFat.push(buffer.readUInt32LE(offset + itemOffset));
    }
  }
  const rootMiniSectorCount = Math.ceil(rootEntry.streamSize / miniSectorSize);
  if (rootMiniStreamChain.length * sectorSize < rootEntry.streamSize) {
    throw new Error('El XLS contiene un mini stream raíz truncado');
  }

  const walkMiniChain = (startSector, expectedSectors) => {
    const seen = new Set();
    let sectorId = startSector;
    let count = 0;
    while (sectorId !== END_OF_CHAIN) {
      if (!Number.isInteger(sectorId) || sectorId < 0 || sectorId >= rootMiniSectorCount || sectorId >= miniFat.length) {
        throw new Error('El XLS contiene una referencia miniFAT fuera del archivo');
      }
      if (seen.has(sectorId)) throw new Error('El XLS contiene una cadena miniFAT cíclica');
      seen.add(sectorId);
      count += 1;
      if (count > expectedSectors) throw new Error('El XLS contiene una cadena miniFAT excesiva');
      const nextSector = miniFat[sectorId];
      if (nextSector === FREE_SECTOR || nextSector === FAT_SECTOR || nextSector === DIFAT_SECTOR) {
        throw new Error('El XLS contiene una cadena miniFAT inválida');
      }
      sectorId = nextSector;
    }
    if (count !== expectedSectors) throw new Error('El XLS contiene una cadena miniFAT truncada');
  };

  for (const entry of directoryEntries) {
    if (entry.objectType !== 2) continue;
    if (entry.streamSize === 0) {
      if (entry.startSector !== END_OF_CHAIN && entry.startSector !== FREE_SECTOR) {
        throw new Error('El XLS contiene un flujo OLE vacío inconsistente');
      }
    } else if (entry.streamSize < miniStreamCutoff) {
      if (!miniFat.length || rootEntry.streamSize === 0) {
        throw new Error('El XLS contiene un flujo pequeño sin miniFAT');
      }
      walkMiniChain(entry.startSector, Math.ceil(entry.streamSize / miniSectorSize));
    } else {
      validateRegularStream(entry, 'flujo de datos');
    }
  }
}

function validateHeaders(rawHeaders, sourceLabel) {
  if (!Array.isArray(rawHeaders) || !rawHeaders.length) {
    throw new Error(`${sourceLabel} no contiene encabezados`);
  }
  if (rawHeaders.length > MAX_SOURCE_COLUMNS) {
    throw new Error(`${sourceLabel} supera el límite de ${MAX_SOURCE_COLUMNS} columnas`);
  }

  const headers = rawHeaders.map(value => String(value ?? '').normalize('NFKC').trim());
  if (headers.some(header => !header)) {
    throw new Error(`${sourceLabel} contiene encabezados vacíos`);
  }
  if (headers.some(header => Buffer.byteLength(header, 'utf8') > MAX_HEADER_BYTES)) {
    throw new Error(`${sourceLabel} contiene encabezados demasiado largos`);
  }

  const seen = new Set();
  for (const header of headers) {
    const canonical = header.toLowerCase();
    if (seen.has(canonical)) throw new Error(`${sourceLabel} contiene encabezados duplicados`);
    seen.add(canonical);
    const segments = canonical.split(/[.\[\]]+/).filter(Boolean);
    if (segments.some(segment => DANGEROUS_HEADER_SEGMENTS.has(segment))) {
      throw new Error(`${sourceLabel} contiene un encabezado no permitido`);
    }
  }
  return headers;
}

function validateParsedRecords(parsed) {
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error('El archivo no contiene filas interpretables');
  }
  if (parsed.length > MAX_SOURCE_ROWS) {
    throw new Error(`El archivo supera el límite de ${MAX_SOURCE_ROWS} filas`);
  }

  let totalBytes = 0;
  for (const row of parsed) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('Las filas deben ser objetos estructurados');
    }
    validateHeaders(Object.keys(row), 'Fila');
    const serialized = JSON.stringify(row);
    if (serialized === undefined) throw new Error('La fila no puede serializarse');
    const recordBytes = Buffer.byteLength(serialized, 'utf8');
    if (recordBytes > MAX_RECORD_BYTES) {
      throw new Error(`Una fila supera el límite de ${MAX_RECORD_BYTES} bytes`);
    }
    totalBytes += recordBytes;
    if (totalBytes > MAX_PARSED_BYTES) {
      throw new Error(`Los datos interpretados superan el límite de ${MAX_PARSED_BYTES} bytes`);
    }
  }
}

async function parsePDF(filepath) {
  const dataBuffer = fs.readFileSync(filepath);
  if (dataBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('La firma del archivo no coincide con un PDF');
  }

  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: dataBuffer });
  try {
    // `first` acota el trabajo antes de conocer el total declarado por el PDF.
    const data = await parser.getText({ first: MAX_PDF_PAGES + 1 });
    if (!Number.isInteger(data?.total) || data.total < 1 || data.total > MAX_PDF_PAGES) {
      throw new Error(`El PDF supera el límite de ${MAX_PDF_PAGES} páginas`);
    }
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (!text) throw new Error('El PDF no contiene texto extraíble');
    return { text, pageCount: data.total };
  } finally {
    await parser.destroy().catch(() => {});
  }
}
