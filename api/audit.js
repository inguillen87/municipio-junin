import pkg from 'pg';
import { noStore, requireDatasetTenant, requireRole } from './lib/auth.js';
import databaseUrlPolicy from '../shared/database-url-policy.cjs';
const { Pool } = pkg;
const { inspectDatabaseUrl } = databaseUrlPolicy;

const AUDIT_READ_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE'];
const AUDIT_WRITE_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN'];

let pool;

function databasePool() {
  const inspected = inspectDatabaseUrl(process.env.DATABASE_URL, { nodeEnv: process.env.NODE_ENV });
  pool ??= new Pool({ connectionString: inspected.connectionString });
  return pool;
}

function retiredCapability(res, capability) {
  return res.status(410).json({
    success: false,
    code: 'LEGACY_CAPABILITY_RETIRED',
    capability,
    error: 'La capacidad legacy fue retirada hasta contar con un contrato auditable y tenant-aware'
  });
}

export default async function handler(req, res) {
  noStore(res);
  const { action } = req.query || {};

  if (req.method === 'DELETE' && action === 'delete-dataset') {
    const caller = await requireRole(req, res, AUDIT_WRITE_ROLES);
    if (!caller || !requireDatasetTenant(res, caller, 'LEGACY_ANALYTICS_TENANT_ID')) return;
    return retiredCapability(res, 'delete-dataset');
  }

  if (req.method === 'GET') {
    const caller = await requireRole(req, res, AUDIT_READ_ROLES);
    if (!caller || !requireDatasetTenant(res, caller, 'LEGACY_ANALYTICS_TENANT_ID')) return;
    if (action === 'connections') return retiredCapability(res, 'connections');
    let db;
    try {
      db = databasePool();
    } catch {
      return res.status(503).json({ error: 'El inventario PostgreSQL no supera la política TLS' });
    }
    try {
      if (action === 'overview') {
        const stats = await getOverviewStats(db);
        return res.status(200).json(stats);
      } 
      else if (action === 'datasets') {
        const { module } = req.query || {};
        const page = Math.max(1, Number.parseInt(req.query?.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query?.limit, 10) || 20));
        const offset = (page - 1) * limit;
        
        let query = `SELECT id, module, source_type, row_count, period, processed, created_at
                     FROM datasets`;
        const params = [];
        if (module) {
          query += ' WHERE module = $1';
          params.push(module);
        }
        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
        
        const result = await db.query(query, params);
        return res.status(200).json({ data: result.rows });
      }
      else if (action === 'reports') {
        const result = await db.query(
          `SELECT id, type, period, alert_level, notified, created_at
           FROM intelligence_reports
           ORDER BY created_at DESC LIMIT 20`
        );
        return res.status(200).json({ data: result.rows });
      }
      else if (action === 'timeline') {
        // Combine datasets and reports for a timeline. A schema/DB failure must
        // remain distinguishable from a legitimate empty timeline.
        const query = `
          SELECT 'upload' as type, COALESCE(module, 'dataset') as description, created_at FROM datasets
          UNION ALL
          SELECT 'report' as type, type as description, created_at FROM intelligence_reports
          ORDER BY created_at DESC
          LIMIT 50
        `;
        const result = await db.query(query);
        return res.status(200).json({ data: result.rows });
      }
      
      return res.status(400).json({ error: 'Acción no válida' });
    } catch (error) {
      console.error('Audit API error:', error);
      return res.status(500).json({ error: 'Error en el servidor de auditoría' });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

async function getOverviewStats(db) {
  const dsResult = await db.query('SELECT COUNT(*) as total FROM datasets');
  const rowResult = await db.query('SELECT SUM(row_count) as total_rows FROM datasets');
  const lastResult = await db.query('SELECT created_at FROM datasets ORDER BY created_at DESC LIMIT 1');
  const modResult = await db.query('SELECT DISTINCT module FROM datasets');

  return {
    totalDatasets: parseInt(dsResult.rows[0]?.total || 0),
    totalRows: parseInt(rowResult.rows[0]?.total_rows || 0),
    lastUpload: lastResult.rows[0]?.created_at || null,
    activeModules: modResult.rows.map(r => r.module),
    recentAlerts: []
  };
}
