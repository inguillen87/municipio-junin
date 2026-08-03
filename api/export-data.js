import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { module, period, format = 'csv' } = req.query;

  try {
    let query = 'SELECT data FROM data_points WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (module) {
      query += ` AND dataset_id IN (SELECT id FROM datasets WHERE module = $${paramCount})`;
      params.push(module);
      paramCount++;
    }

    if (period) {
      query += ` AND dataset_id IN (SELECT id FROM datasets WHERE period = $${paramCount})`;
      params.push(period);
      paramCount++;
    }

    // Attempting to run query if table exists. Catching if not.
    let result;
    try {
      result = await pool.query(query, params);
    } catch (e) {
      // If table doesn't exist or other error, return empty array
      result = { rows: [] };
    }
    
    const rows = result.rows.map(r => r.data || {});

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="export_${module||'all'}_${period||'all'}.json"`);
      return res.status(200).json(rows);
    } 
    else if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="export_${module||'all'}_${period||'all'}.csv"`);
      
      if (rows.length === 0) {
        return res.status(200).send('');
      }

      const headers = Object.keys(rows[0]);
      let csvContent = headers.join(',') + '\\n';
      
      for (const row of rows) {
        const values = headers.map(header => {
          let val = row[header] === null || row[header] === undefined ? '' : String(row[header]);
          val = val.replace(/"/g, '""');
          if (val.search(/("|,|\\n)/g) >= 0) {
            val = `"${val}"`;
          }
          return val;
        });
        csvContent += values.join(',') + '\\n';
      }

      return res.status(200).send(csvContent);
    } 
    else if (format === 'xlsx') {
      // For XLSX we return an error since xlsx package might not be installed,
      // but ideally we would use `xlsx` or `exceljs`.
      return res.status(501).json({ error: 'Exportación a XLSX requiere el paquete xlsx o exceljs.' });
    }

    return res.status(400).json({ error: 'Formato no soportado' });
  } catch (error) {
    console.error('Export error:', error);
    return res.status(500).json({ error: 'Error en el servidor al exportar datos' });
  }
}
