import { prisma } from '../lib/db.js';
import { requireAuth, cors } from '../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();
  
  const user = requireAuth(req, res);
  if (!user) return;
  const tenantId = user.tenantId;

  try {
    const now = new Date();
    const mesActual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      empleadosActivos,
      pagosMes,
      reclamosAbiertos,
      obrasActivas,
      presupuestoMes,
      topSecretarias,
      reclamosPorEstado,
      pagosUltimos6Meses
    ] = await Promise.all([
      prisma.empleado.count({ where: { tenantId, estado: 'Activo' } }),
      prisma.pago.aggregate({
        where: { tenantId, fecha: { gte: inicioMes } },
        _sum: { monto: true },
        _count: { id: true }
      }),
      prisma.reclamo.count({ where: { tenantId, estado: { in: ['Pendiente', 'En proceso'] } } }),
      prisma.obra.count({ where: { tenantId, estado: 'En ejecucion' } }),
      prisma.presupuesto.aggregate({
        where: { tenantId, periodo: mesActual },
        _sum: { asignado: true, ejecutado: true }
      }),
      // Top secretarias by spend
      prisma.pago.groupBy({
        by: ['secretaria'],
        where: { tenantId, fecha: { gte: inicioMes } },
        _sum: { monto: true },
        orderBy: { _sum: { monto: 'desc' } },
        take: 5
      }),
      // Reclamos by estado
      prisma.reclamo.groupBy({
        by: ['estado'],
        where: { tenantId },
        _count: { id: true }
      }),
      // Monthly spend trend (last 6 months)
      prisma.$queryRaw`
        SELECT 
          TO_CHAR(fecha, 'YYYY-MM') as periodo,
          SUM(monto)::float as total,
          COUNT(*)::int as cantidad
        FROM "pagos"
        WHERE "tenantId" = ${tenantId}
          AND fecha >= NOW() - INTERVAL '6 months'
        GROUP BY TO_CHAR(fecha, 'YYYY-MM')
        ORDER BY periodo ASC
      `

    ]);

    return res.status(200).json({
      kpis: {
        empleadosActivos,
        gastoMes: pagosMes._sum.monto || 0,
        cantPagosMes: pagosMes._count.id,
        reclamosAbiertos,
        obrasActivas,
        presupuestoAsignado: presupuestoMes._sum.asignado || 0,
        presupuestoEjecutado: presupuestoMes._sum.ejecutado || 0,
        ejecucionPct: presupuestoMes._sum.asignado 
          ? Math.round((presupuestoMes._sum.ejecutado / presupuestoMes._sum.asignado) * 100) 
          : 0
      },
      topSecretarias: topSecretarias.map(s => ({ secretaria: s.secretaria, total: s._sum.monto })),
      reclamosPorEstado: reclamosPorEstado.map(r => ({ estado: r.estado, count: r._count.id })),
      tendenciaGasto: pagosUltimos6Meses
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error calculando KPIs', details: err.message });
  }
}
