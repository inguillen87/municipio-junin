// api/upload-handler.js
// Recibe archivos (CSV, XLSX, PDF), los parsea y guarda en Neon PostgreSQL
// Ruta: POST /api/upload-handler

export const config = { api: { bodyParser: false } };

import { IncomingForm } from 'formidable';
import fs from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify session
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No autorizado' });

  try {
    // Parse multipart form
    const { fields, files } = await parseForm(req);
    const module   = (fields.module?.[0]  || fields.module  || 'general').toLowerCase();
    const period   = fields.period?.[0]   || fields.period  || getCurrentPeriod();
    const sourceType = 'upload';

    const results = [];
    const fileList = Array.isArray(files.file) ? files.file : [files.file].filter(Boolean);

    for (const file of fileList) {
      const ext = path.extname(file.originalFilename || file.name || '').toLowerCase();
      let parsed = null;
      let rowCount = 0;

      try {
        if (ext === '.csv') {
          parsed = await parseCSV(file.filepath || file.path);
          rowCount = parsed.length;
        } else if (ext === '.xlsx' || ext === '.xls') {
          parsed = await parseExcel(file.filepath || file.path);
          rowCount = parsed.length;
        } else if (ext === '.pdf') {
          parsed = await parsePDF(file.filepath || file.path);
          rowCount = 1; // PDF = 1 document record
        } else if (ext === '.json') {
          const raw = fs.readFileSync(file.filepath || file.path, 'utf8');
          parsed = JSON.parse(raw);
          rowCount = Array.isArray(parsed) ? parsed.length : 1;
        }
      } catch (parseErr) {
        console.error('Parse error:', parseErr.message);
        parsed = null;
      }

      // Save dataset record
      const [dataset] = await sql`
        INSERT INTO datasets (module, filename, source_type, row_count, period, processed)
        VALUES (${module}, ${file.originalFilename || file.name}, ${sourceType}, ${rowCount}, ${period}, ${parsed !== null})
        RETURNING id
      `;

      // Save parsed data points
      if (parsed && rowCount > 0) {
        const dataToStore = Array.isArray(parsed) ? parsed : [parsed];
        // Batch insert (up to 500 rows)
        const batch = dataToStore.slice(0, 500);
        for (const row of batch) {
          await sql`
            INSERT INTO data_points (dataset_id, module, period, data)
            VALUES (${dataset.id}, ${module}, ${period}, ${JSON.stringify(row)})
          `;
        }
      }

      results.push({
        id: dataset.id,
        filename: file.originalFilename || file.name,
        module,
        period,
        rowCount,
        parsed: parsed !== null,
        ext,
      });
    }

    return res.status(200).json({
      success: true,
      files: results,
      message: `${results.length} archivo(s) procesado(s) correctamente`,
    });

  } catch (err) {
    console.error('Upload handler error:', err);
    return res.status(500).json({ error: 'Error procesando archivos: ' + err.message });
  }
}

// ── PARSERS ──────────────────────────────────────────────────────

async function parseCSV(filepath) {
  // Dynamic import to avoid bundling issues
  try {
    const { default: Papa } = await import('papaparse');
    const content = fs.readFileSync(filepath, 'utf8');
    const result = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      encoding: 'UTF-8',
    });
    return result.data;
  } catch (e) {
    // Fallback: manual CSV parse
    const lines = fs.readFileSync(filepath, 'utf8').split('\n').filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']));
    });
  }
}

async function parseExcel(filepath) {
  try {
    const { default: XLSX } = await import('xlsx');
    const wb = XLSX.readFile(filepath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: null });
  } catch (e) {
    console.error('Excel parse error:', e.message);
    return [];
  }
}

async function parsePDF(filepath) {
  try {
    const pdfParse = await import('pdf-parse');
    const dataBuffer = fs.readFileSync(filepath);
    const data = await pdfParse.default(dataBuffer);
    return {
      text: data.text,
      numPages: data.numpages,
      info: data.info,
      // Extract tables heuristically
      lines: data.text.split('\n').filter(l => l.trim()),
    };
  } catch (e) {
    console.error('PDF parse error:', e.message);
    return { text: fs.readFileSync(filepath, 'utf8'), numPages: 1 };
  }
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ maxFileSize: 50 * 1024 * 1024 }); // 50MB
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
