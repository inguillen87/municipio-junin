import { IncomingForm } from 'formidable';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import * as xlsx from 'xlsx';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No autorizado' });

  try {
    const { fields, files } = await parseForm(req);
    const module = (fields.module?.[0] || 'general').toLowerCase();
    const period = fields.period?.[0] || getCurrentPeriod();
    const sourceType = 'upload';

    const results = [];
    const fileList = Array.isArray(files.file) ? files.file : (files.file ? [files.file] : []);

    for (const file of fileList) {
      const originalFilename = file.originalFilename || file.name || '';
      const ext = path.extname(originalFilename).toLowerCase();
      let parsed = null;
      let rowCount = 0;
      const filepath = file.filepath || file.path;

      try {
        if (ext === '.csv') {
          parsed = parseCSVManual(filepath);
          rowCount = parsed.length;
        } else if (ext === '.xlsx' || ext === '.xls') {
          parsed = await parseExcel(filepath);
          rowCount = parsed.length;
        } else if (ext === '.pdf') {
          parsed = await parsePDF(filepath);
          rowCount = 1;
        } else if (ext === '.json') {
          const raw = fs.readFileSync(filepath, 'utf8');
          parsed = JSON.parse(raw);
          rowCount = Array.isArray(parsed) ? parsed.length : 1;
        }
      } catch (parseErr) {
        console.error('Parse error:', parseErr.message);
        parsed = null;
      }

      const dsRes = await pool.query(
        "INSERT INTO datasets (module, filename, source_type, row_count, period, processed) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
        [module, originalFilename, sourceType, rowCount, period, parsed !== null]
      );
      const datasetId = dsRes.rows[0].id;

      if (parsed && rowCount > 0) {
        const dataToStore = Array.isArray(parsed) ? parsed : [parsed];
        const batch = dataToStore.slice(0, 500);
        for (const row of batch) {
          await pool.query(
            "INSERT INTO data_points (dataset_id, module, period, data) VALUES ($1, $2, $3, $4)",
            [datasetId, module, period, JSON.stringify(row)]
          );
        }
      }

      results.push({
        id: datasetId,
        filename: originalFilename,
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

function parseCSVManual(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']));
  });
}

async function parseExcel(filepath) {
  try {
    const wb = xlsx.readFile(filepath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    return xlsx.utils.sheet_to_json(ws, { defval: null });
  } catch (e) {
    console.error('Excel parse error:', e.message);
    return [];
  }
}

async function parsePDF(filepath) {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const dataBuffer = fs.readFileSync(filepath);
    const data = await pdfParse(dataBuffer);
    return {
      text: data.text,
      numPages: data.numpages,
      info: data.info,
      lines: data.text.split('\n').filter(l => l.trim()),
    };
  } catch (e) {
    console.error('PDF parse error:', e.message);
    return { text: fs.readFileSync(filepath, 'utf8'), numPages: 1 };
  }
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ maxFileSize: 50 * 1024 * 1024 });
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
