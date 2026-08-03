import { prisma } from '../lib/db.js';
import { requireAuth, cors } from '../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  
  const user = requireAuth(req, res);
  if (!user) return;
  const tenantId = user.tenantId;

  const { tabla, rows, truncate = false } = req.body;
  if (!tabla || !rows || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'tabla y rows[] requeridos' });
  }

  const ALLOWED_TABLES = ['empleados', 'pagos', 'presupuestos', 'reclamos', 'obras', 'licitaciones'];
  if (!ALLOWED_TABLES.includes(tabla)) {
    return res.status(400).json({ error: 'Tabla no permitida' });
  }

  try {
    let insertCount = 0;
    let errorCount = 0;
    const errors = [];

    // Map table name to Prisma model name
    const modelMap = {
      empleados: 'empleado', pagos: 'pago', presupuestos: 'presupuesto',
      reclamos: 'reclamo', obras: 'obra', licitaciones: 'licitacion'
    };
    const model = modelMap[tabla];

    // Optional: clear existing data for this tenant+table before import
    if (truncate) {
      await prisma[model].deleteMany({ where: { tenantId } });
    }

    // Batch insert (50 rows at a time)
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      for (const row of batch) {
        try {
          // Convert date strings to Date objects if necessary
          if (row.fecha) row.fecha = new Date(row.fecha);
          if (row.fechaInicio) row.fechaInicio = new Date(row.fechaInicio);
          if (row.fechaFin) row.fechaFin = new Date(row.fechaFin);
          
          await prisma[model].upsert({
            where: {
              // Use unique constraint
              ...(tabla === 'empleados' ? { tenantId_legajo: { tenantId, legajo: String(row.legajo || Date.now()) } } : {}),
              ...(tabla === 'pagos' ? { id: row.id || 'new-' + Date.now() + Math.random() } : {}),
              ...(tabla === 'reclamos' ? { tenantId_numero: { tenantId, numero: String(row.numero || 'R'+Date.now()) } } : {}),
              ...(tabla === 'presupuestos' ? { tenantId_secretaria_periodo: { tenantId, secretaria: row.secretaria, periodo: row.periodo } } : {}),
              ...(tabla === 'obras' ? { id: row.id || 'new-' + Date.now() + Math.random() } : {}),
              ...(tabla === 'licitaciones' ? { tenantId_numero: { tenantId, numero: String(row.numero || 'L'+Date.now()) } } : {}),
            },
            update: { ...row, tenantId, updatedAt: new Date() },
            create: { ...row, tenantId }
          });
          insertCount++;
        } catch (rowErr) {
          errorCount++;
          errors.push({ row: i, error: rowErr.message });
        }
      }
    }

    return res.status(200).json({ 
      success: true, insertCount, errorCount, 
      errors: errors.slice(0, 10),
      message: `Importados ${insertCount} registros en ${tabla}. ${errorCount > 0 ? errorCount + ' errores.' : ''}` 
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error de importacion', details: err.message });
  }
}
