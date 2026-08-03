// api/google-sheets.js
// Importa Google Sheets públicos como CSV → Neon DB
// Endpoint: POST /api/google-sheets
// Body: { sheetUrl, module, period, saveConnection? }

import pg from 'pg';
const { Pool } = pg;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sheetUrl, spreadsheetId, sheetName, module = 'general', period, saveConnection } = req.body;

  if (!sheetUrl && !spreadsheetId) {
    return res.status(400).json({ error: 'Se requiere sheetUrl o spreadsheetId' });
  }

  const currentPeriod = period || getCurrentPeriod();

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
    const fetchResp = await fetch(csvUrl, {
      headers: { 'Accept': 'text/csv', 'User-Agent': 'MuniControl/1.0' },
      redirect: 'follow',
    });

    if (!fetchResp.ok) {
      return res.status(400).json({
        error: 'No se pudo acceder al Google Sheet. Verificá que sea público (Compartir → Cualquiera con el enlace).',
        httpStatus: fetchResp.status,
      });
    }

    const csvText = await fetchResp.text();
    if (!csvText || csvText.length < 5) {
      return res.status(400).json({ error: 'El sheet está vacío o no tiene datos' });
    }

    // Parse CSV
    const rows = parseCSVText(csvText);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'No se encontraron filas de datos en el sheet' });
    }

    // Save to Neon
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Register dataset
      const dsResult = await client.query(
        `INSERT INTO datasets (module, filename, source_type, row_count, period, processed, blob_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [module, 'google-sheet.csv', 'gdrive', rows.length, currentPeriod, true, csvUrl]
      );
      const datasetId = dsResult.rows[0].id;

      // Insert data points in batches of 100
      const batchSize = 100;
      for (let i = 0; i < Math.min(rows.length, 5000); i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        for (const row of batch) {
          await client.query(
            'INSERT INTO data_points (dataset_id, module, period, data) VALUES ($1, $2, $3, $4)',
            [datasetId, module, currentPeriod, JSON.stringify(row)]
          );
        }
      }

      // Optionally save as a recurring connection
      if (saveConnection) {
        await client.query(
          `INSERT INTO data_connections (module, conn_type, conn_name, config, schedule, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [module, 'gdrive', `Google Sheet · ${module}`, JSON.stringify({ csvUrl, sheetUrl }), 'daily', 'active']
        );
      }

      await client.query('COMMIT');

      return res.status(200).json({
        success: true,
        datasetId,
        rowCount: rows.length,
        module,
        period: currentPeriod,
        columns: rows.length > 0 ? Object.keys(rows[0]) : [],
        preview: rows.slice(0, 3),
        message: `${rows.length} filas importadas desde Google Sheets`,
      });

    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
      await pool.end();
    }

  } catch (err) {
    console.error('Google Sheets import error:', err);
    return res.status(500).json({ error: 'Error al importar: ' + err.message });
  }
}

// ── CSV Parser ────────────────────────────────────────────────
function parseCSVText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.every(v => !v)) continue; // skip blank rows
    const obj = {};
    headers.forEach((h, idx) => {
      const key = h.replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_').toLowerCase() || `col_${idx}`;
      const val = vals[idx] || '';
      // Auto-coerce numbers
      const num = Number(val.replace(/[,$%]/g, ''));
      obj[key] = val && !isNaN(num) && val.trim() !== '' ? num : val;
    });
    rows.push(obj);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
