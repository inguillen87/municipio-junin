import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export default async function handler(req, res) {
  const { action } = req.query;

  if (req.method === 'DELETE' && action === 'delete-dataset') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'Falta ID' });

    try {
      await pool.query('BEGIN');
      await pool.query('DELETE FROM data_points WHERE dataset_id = $1', [id]);
      await pool.query('DELETE FROM datasets WHERE id = $1', [id]);
      await pool.query('COMMIT');
      return res.status(200).json({ success: true });
    } catch (error) {
      await pool.query('ROLLBACK');
      console.error('Delete dataset error:', error);
      return res.status(500).json({ success: false, error: 'Error al borrar dataset' });
    }
  }

  if (req.method === 'GET') {
    try {
      if (action === 'overview') {
        const stats = await getOverviewStats();
        return res.status(200).json(stats);
      } 
      else if (action === 'datasets') {
        const { module, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        let query = 'SELECT * FROM datasets';
        const params = [];
        if (module) {
          query += ' WHERE module = $1';
          params.push(module);
        }
        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
        
        try {
          const result = await pool.query(query, params);
          return res.status(200).json({ data: result.rows });
        } catch(e) {
          return res.status(200).json({ data: [] });
        }
      }
      else if (action === 'reports') {
        try {
          const result = await pool.query('SELECT * FROM intelligence_reports ORDER BY created_at DESC LIMIT 20');
          return res.status(200).json({ data: result.rows });
        } catch(e) {
          return res.status(200).json({ data: [] });
        }
      }
      else if (action === 'connections') {
        try {
          const result = await pool.query('SELECT id, name, type, host, port, database, created_at FROM data_connections ORDER BY created_at DESC');
          return res.status(200).json({ data: result.rows });
        } catch(e) {
          return res.status(200).json({ data: [] });
        }
      }
      else if (action === 'timeline') {
        try {
          // Combine datasets and reports for a timeline
          const query = `
            SELECT 'upload' as type, filename as description, created_at FROM datasets
            UNION ALL
            SELECT 'report' as type, type as description, created_at FROM intelligence_reports
            ORDER BY created_at DESC
            LIMIT 50
          `;
          const result = await pool.query(query);
          return res.status(200).json({ data: result.rows });
        } catch(e) {
          return res.status(200).json({ data: [] });
        }
      }
      
      return res.status(400).json({ error: 'Acción no válida' });
    } catch (error) {
      console.error('Audit API error:', error);
      return res.status(500).json({ error: 'Error en el servidor de auditoría' });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

async function getOverviewStats() {
  try {
    const dsResult = await pool.query('SELECT COUNT(*) as total FROM datasets');
    const rowResult = await pool.query('SELECT SUM(row_count) as total_rows FROM datasets');
    const lastResult = await pool.query('SELECT created_at FROM datasets ORDER BY created_at DESC LIMIT 1');
    const modResult = await pool.query('SELECT DISTINCT module FROM datasets');
    
    return {
      totalDatasets: parseInt(dsResult.rows[0]?.total || 0),
      totalRows: parseInt(rowResult.rows[0]?.total_rows || 0),
      lastUpload: lastResult.rows[0]?.created_at || null,
      activeModules: modResult.rows.map(r => r.module),
      recentAlerts: [] // Add alerts if you have an alerts table
    };
  } catch(e) {
    return {
      totalDatasets: 0,
      totalRows: 0,
      lastUpload: null,
      activeModules: [],
      recentAlerts: []
    };
  }
}
