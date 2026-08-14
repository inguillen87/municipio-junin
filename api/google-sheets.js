// The public-Sheets importer is retired. Its bounded CSV parser stays exported
// for compatibility tests and offline inspection, but the runtime never
// fetches a remote document or writes legacy datasets/data_points.
import Papa from 'papaparse';
import { noStore, requireDatasetTenant, requireRole } from './lib/auth.js';

const IMPORT_ROLES = Object.freeze(['SUPER_ADMIN', 'TENANT_ADMIN']);
const MAX_SOURCE_ROWS = 10000;
const MAX_SOURCE_COLUMNS = 200;
const MAX_HEADER_BYTES = 128;
const MAX_RECORD_BYTES = 256 * 1024;
const MAX_PARSED_BYTES = 10 * 1024 * 1024;
const DANGEROUS_HEADER_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

export class ImportValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ImportValidationError';
    this.statusCode = statusCode;
  }
}
export function createGoogleSheetsHandler({
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
      code: 'LEGACY_GOOGLE_SHEETS_IMPORT_RETIRED',
      error: 'La importacion desde Google Sheets fue retirada. Use el ingreso gobernado en cuarentena.',
      replacement: '/api/source-intake',
    });
  };
}

export default createGoogleSheetsHandler();

export function parseCSVText(text) {
  let headers = null;
  let parseError = null;
  let tooManyRows = false;
  let parsedBytes = 0;
  const rows = [];

  Papa.parse(text, {
    header: false,
    delimiter: ',',
    dynamicTyping: false,
    skipEmptyLines: 'greedy',
    step(result, parser) {
      if (result.errors?.length) {
        parseError = new ImportValidationError('El CSV tiene una estructura invalida');
        parser.abort();
        return;
      }

      const values = Array.isArray(result.data) ? result.data : [result.data];
      if (!headers) {
        try {
          headers = validateHeaders(values);
        } catch (error) {
          parseError = error;
          parser.abort();
        }
        return;
      }

      if (rows.length >= MAX_SOURCE_ROWS) {
        tooManyRows = true;
        parser.abort();
        return;
      }
      if (values.length > headers.length) {
        parseError = new ImportValidationError('El CSV contiene filas con mas columnas que el encabezado');
        parser.abort();
        return;
      }

      const row = Object.fromEntries(headers.map((header, index) => [
        header,
        values[index] === undefined || values[index] === null ? '' : String(values[index]),
      ]));
      const recordBytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
      if (recordBytes > MAX_RECORD_BYTES) {
        parseError = new ImportValidationError('El CSV contiene una fila demasiado grande');
        parser.abort();
        return;
      }
      parsedBytes += recordBytes;
      if (parsedBytes > MAX_PARSED_BYTES) {
        parseError = new ImportValidationError('Los datos interpretados superan el limite permitido');
        parser.abort();
        return;
      }
      rows.push(row);
    },
  });

  if (parseError) throw parseError;
  if (tooManyRows) throw new ImportValidationError(`El CSV supera el limite de ${MAX_SOURCE_ROWS} filas`);
  if (!headers || !rows.length) throw new ImportValidationError('No se encontraron filas de datos en el sheet');
  return rows;
}

function validateHeaders(rawHeaders) {
  if (!Array.isArray(rawHeaders) || !rawHeaders.length) {
    throw new ImportValidationError('El CSV no contiene encabezados');
  }
  if (rawHeaders.length > MAX_SOURCE_COLUMNS) {
    throw new ImportValidationError(`El CSV supera el limite de ${MAX_SOURCE_COLUMNS} columnas`);
  }

  const rawSeen = new Set();
  const normalizedSeen = new Set();
  return rawHeaders.map(rawHeader => {
    const header = String(rawHeader ?? '').normalize('NFKC').trim();
    if (!header) throw new ImportValidationError('El CSV contiene encabezados vacios');
    if (Buffer.byteLength(header, 'utf8') > MAX_HEADER_BYTES) {
      throw new ImportValidationError('El CSV contiene encabezados demasiado largos');
    }
    if (/[\u0000-\u001F\u007F]/u.test(header)) {
      throw new ImportValidationError('El CSV contiene un encabezado no permitido');
    }

    const canonical = header.toLowerCase();
    if (rawSeen.has(canonical)) throw new ImportValidationError('El CSV contiene encabezados duplicados');
    rawSeen.add(canonical);

    const rawSegments = canonical.split(/[.\[\]\\/]+/u).map(segment => segment.trim()).filter(Boolean);
    if (DANGEROUS_HEADER_SEGMENTS.has(canonical) ||
        rawSegments.some(segment => DANGEROUS_HEADER_SEGMENTS.has(segment))) {
      throw new ImportValidationError('El CSV contiene un encabezado no permitido');
    }

    const normalized = header
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_]+/gu, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!normalized) throw new ImportValidationError('El CSV contiene encabezados vacios');
    if (normalized.split('_').some(segment => DANGEROUS_HEADER_SEGMENTS.has(segment))) {
      throw new ImportValidationError('El CSV contiene un encabezado no permitido');
    }
    if (normalizedSeen.has(normalized)) {
      throw new ImportValidationError('El CSV contiene encabezados que colisionan al normalizarse');
    }
    normalizedSeen.add(normalized);
    return normalized;
  });
}
