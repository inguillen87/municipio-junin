// api/google-sheets.js
// Importa Google Sheets públicos como CSV → Neon DB
// Endpoint: POST /api/google-sheets
// Body: { sheetUrl, module, period, saveConnection? }

import pg from 'pg';
import Papa from 'papaparse';
import { noStore, requireDatasetTenant, requireRole } from './lib/auth.js';
import databaseUrlPolicy from '../shared/database-url-policy.cjs';
const { Pool } = pg;
const { inspectDatabaseUrl } = databaseUrlPolicy;
const IMPORT_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN'];
const ALLOWED_MODULES = new Set(['general', 'rrhh', 'hacienda', 'obras', 'licitaciones', 'vecinos']);
const ALLOWED_CSV_MIME_TYPES = new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel']);
const MAX_REMOTE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5000;
const MAX_SOURCE_ROWS = 10000;
const MAX_SOURCE_COLUMNS = 200;
const MAX_HEADER_BYTES = 128;
const MAX_RECORD_BYTES = 256 * 1024;
const MAX_PARSED_BYTES = 10 * 1024 * 1024;
const DANGEROUS_HEADER_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

class ImportValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ImportValidationError';
    this.statusCode = statusCode;
  }
}

export function createGoogleSheetsHandler(overrides = {}) {
  const fetchImpl = overrides.fetchImpl || globalThis.fetch;
  const PoolClass = overrides.PoolClass || Pool;
  const requireRoleImpl = overrides.requireRoleImpl || requireRole;
  const requireDatasetTenantImpl = overrides.requireDatasetTenantImpl || requireDatasetTenant;
  const databaseUrl = overrides.databaseUrl ?? process.env.DATABASE_URL;
  const nodeEnv = overrides.nodeEnv ?? process.env.NODE_ENV;

  return async function handler(req, res) {
  noStore(res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await requireRoleImpl(req, res, IMPORT_ROLES);
  if (!caller || !requireDatasetTenantImpl(res, caller, 'LEGACY_ANALYTICS_TENANT_ID')) return;

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length === 0) {
    return res.status(400).json({
      error: 'Se requiere un cuerpo JSON con sheetUrl o spreadsheetId',
      parsed: false,
      persisted: false
    });
  }

  const { sheetUrl, spreadsheetId, sheetName, module = 'general', period, saveConnection } = req.body;

  if (saveConnection) {
    return res.status(422).json({ error: 'La sincronización programada todavía no está habilitada' });
  }

  if (!sheetUrl && !spreadsheetId) {
    return res.status(400).json({ error: 'Se requiere sheetUrl o spreadsheetId' });
  }

  if (!ALLOWED_MODULES.has(String(module).toLowerCase())) {
    return res.status(400).json({ error: 'Módulo de importación no permitido' });
  }

  const normalizedModule = String(module).toLowerCase();
  const currentPeriod = String(period || '').trim();
  if (!currentPeriod) {
    return res.status(400).json({ error: 'El período del dato es obligatorio. Use YYYY-MM.', parsed: false, persisted: false });
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(currentPeriod)) {
    return res.status(400).json({ error: 'Período inválido. Use YYYY-MM.' });
  }

  let inspectedDatabase;
  try {
    inspectedDatabase = inspectDatabaseUrl(databaseUrl, { nodeEnv });
  } catch {
    return res.status(503).json({ error: 'La persistencia PostgreSQL no supera la política TLS', parsed: false, persisted: false });
  }

  let parsedRowCount = 0;
  try {
    // Build CSV export URL
    let csvUrl;
    if (spreadsheetId) {
      csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
      if (sheetName) csvUrl += `&sheet=${encodeURIComponent(sheetName)}`;
    } else if (sheetUrl) {
      const match = sheetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (!match) return res.status(400).json({ error: 'URL de Google Sheets inválida' });
      csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
    }

    // Fetch the CSV
    const fetchResp = await fetchImpl(csvUrl, {
      headers: { 'Accept': 'text/csv', 'User-Agent': 'MuniControl/1.0' },
      redirect: 'follow',
    });

    if (!fetchResp.ok) {
      return res.status(400).json({
        error: 'No se pudo acceder al Google Sheet. Verificá que sea público (Compartir → Cualquiera con el enlace).',
        httpStatus: fetchResp.status,
      });
    }

    const contentType = String(fetchResp.headers?.get?.('content-type') || '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_CSV_MIME_TYPES.has(contentType)) {
      throw new ImportValidationError('La respuesta remota no es un CSV válido', 415);
    }

    const contentLength = Number(fetchResp.headers.get('content-length') || 0);
    if (contentLength > MAX_REMOTE_BYTES) {
      return res.status(413).json({ error: 'El Google Sheet supera el límite de 5 MB' });
    }
    const csvBuffer = await fetchResp.arrayBuffer();
    if (csvBuffer.byteLength > MAX_REMOTE_BYTES) {
      return res.status(413).json({ error: 'El Google Sheet supera el límite de 5 MB' });
    }
    let csvText;
    try {
      csvText = new TextDecoder('utf-8', { fatal: true }).decode(csvBuffer).replace(/^\uFEFF/, '');
    } catch {
      throw new ImportValidationError('El CSV no usa una codificación UTF-8 válida');
    }
    if (!csvText.trim()) {
      return res.status(400).json({ error: 'El sheet está vacío o no tiene datos' });
    }
    if (looksLikeHtml(csvText)) {
      throw new ImportValidationError('La respuesta remota contiene HTML en lugar de CSV');
    }

    // Parse CSV
    const rows = parseCSVText(csvText);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'No se encontraron filas de datos en el sheet' });
    }
    parsedRowCount = rows.length;
    const insertedRows = Math.min(rows.length, MAX_IMPORT_ROWS);
    const rejectedRows = rows.length - insertedRows;
    const truncated = rejectedRows > 0;

    // Save to Neon
    const pool = new PoolClass({ connectionString: inspectedDatabase.connectionString });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Register dataset
      const dsResult = await client.query(
        `INSERT INTO datasets (module, filename, source_type, row_count, period, processed, blob_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [normalizedModule, 'google-sheet.csv', 'gdrive', insertedRows, currentPeriod, true, csvUrl]
      );
      const datasetId = dsResult.rows[0].id;

      // Insert data points in batches of 100
      const batchSize = 100;
      for (let i = 0; i < insertedRows; i += batchSize) {
        const batch = rows.slice(i, Math.min(i + batchSize, insertedRows));
        for (const row of batch) {
          await client.query(
            'INSERT INTO data_points (dataset_id, module, period, data) VALUES ($1, $2, $3, $4)',
            [datasetId, normalizedModule, currentPeriod, JSON.stringify(row)]
          );
        }
      }

      await client.query('COMMIT');

      return res.status(truncated ? 207 : 200).json({
        success: true,
        status: truncated ? 'partial' : 'success',
        partial: truncated,
        parsed: true,
        persisted: true,
        datasetId,
        id: datasetId,
        sourceRowCount: rows.length,
        parsedRows: rows.length,
        rowCount: insertedRows,
        insertedRows,
        persistedRows: insertedRows,
        rejectedRows,
        truncated,
        limit: MAX_IMPORT_ROWS,
        module: normalizedModule,
        period: currentPeriod,
        columns: rows.length > 0 ? Object.keys(rows[0]) : [],
        preview: rows.slice(0, 3),
        message: rejectedRows > 0
          ? `${insertedRows} filas importadas; ${rejectedRows} excedieron el límite y no se guardaron`
          : `${insertedRows} filas importadas desde Google Sheets`,
      });

    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
      await pool.end();
    }

  } catch (err) {
    if (err instanceof ImportValidationError) {
      return res.status(err.statusCode).json({
        error: err.message,
        parsed: false,
        persisted: false,
        sourceRowCount: 0,
        parsedRows: 0,
        insertedRows: 0,
        persistedRows: 0,
        rejectedRows: 0,
      });
    }
    console.error('Google Sheets import error:', err.message);
    return res.status(500).json({
      error: 'No se pudo completar la importación',
      parsed: parsedRowCount > 0,
      persisted: false,
      sourceRowCount: parsedRowCount,
      parsedRows: parsedRowCount,
      insertedRows: 0,
      persistedRows: 0,
      rejectedRows: parsedRowCount
    });
  }
  };
}

export default createGoogleSheetsHandler();

// ── CSV Parser ────────────────────────────────────────────────
function parseCSVText(text) {
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
        parseError = new ImportValidationError('El CSV tiene una estructura inválida');
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
        parseError = new ImportValidationError('El CSV contiene filas con más columnas que el encabezado');
        parser.abort();
        return;
      }

      const row = Object.fromEntries(headers.map((header, index) => [
        header,
        values[index] === undefined || values[index] === null ? '' : String(values[index]),
      ]));
      const serialized = JSON.stringify(row);
      const recordBytes = Buffer.byteLength(serialized, 'utf8');
      if (recordBytes > MAX_RECORD_BYTES) {
        parseError = new ImportValidationError('El CSV contiene una fila demasiado grande');
        parser.abort();
        return;
      }
      parsedBytes += recordBytes;
      if (parsedBytes > MAX_PARSED_BYTES) {
        parseError = new ImportValidationError('Los datos interpretados superan el límite permitido');
        parser.abort();
        return;
      }
      rows.push(row);
    },
  });

  if (parseError) throw parseError;
  if (tooManyRows) {
    throw new ImportValidationError(`El CSV supera el límite de ${MAX_SOURCE_ROWS} filas`);
  }
  if (!headers || !rows.length) {
    throw new ImportValidationError('No se encontraron filas de datos en el sheet');
  }
  return rows;
}

function validateHeaders(rawHeaders) {
  if (!Array.isArray(rawHeaders) || !rawHeaders.length) {
    throw new ImportValidationError('El CSV no contiene encabezados');
  }
  if (rawHeaders.length > MAX_SOURCE_COLUMNS) {
    throw new ImportValidationError(`El CSV supera el límite de ${MAX_SOURCE_COLUMNS} columnas`);
  }

  const rawSeen = new Set();
  const normalizedSeen = new Set();
  return rawHeaders.map(rawHeader => {
    const header = String(rawHeader ?? '').normalize('NFKC').trim();
    if (!header) throw new ImportValidationError('El CSV contiene encabezados vacíos');
    if (Buffer.byteLength(header, 'utf8') > MAX_HEADER_BYTES) {
      throw new ImportValidationError('El CSV contiene encabezados demasiado largos');
    }
    if (/[\u0000-\u001F\u007F]/u.test(header)) {
      throw new ImportValidationError('El CSV contiene un encabezado no permitido');
    }

    const canonical = header.toLowerCase();
    if (rawSeen.has(canonical)) {
      throw new ImportValidationError('El CSV contiene encabezados duplicados');
    }
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
    if (!normalized) throw new ImportValidationError('El CSV contiene encabezados vacíos');
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

function looksLikeHtml(text) {
  return /^\s*(?:<!doctype\s+html\b|<html\b|<head\b|<body\b|<title\b|<script\b)/i.test(text);
}
