import { prisma } from '../lib/db.js';
import { requireAuth, cors } from '../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const user = requireAuth(req, res);
  if (!user) return;
  
  const tenantId = user.tenantId;

  try {
    if (req.method === 'GET') {
      const { secretaria, estado, desde, hasta, search, limit = 100, offset = 0 } = req.query;
      const where = { tenantId };
      
      if (secretaria) where.secretaria = secretaria;
      if (estado) where.estado = estado;
      
      if (desde || hasta) {
        where.fecha = {};
        if (desde) where.fecha.gte = new Date(desde);
        if (hasta) where.fecha.lte = new Date(hasta);
      }
      
      if (search) {
        where.proveedor = { contains: search, mode: 'insensitive' };
      }

      const [pagos, total] = await Promise.all([
        prisma.pago.findMany({ where, orderBy: { fecha: 'desc' }, take: parseInt(limit), skip: parseInt(offset) }),
        prisma.pago.count({ where })
      ]);

      const stats = await prisma.pago.aggregate({
        where,
        _sum: { monto: true }
      });

      const topProveedores = await prisma.pago.groupBy({
        by: ['proveedor'],
        where,
        _sum: { monto: true },
        orderBy: { _sum: { monto: 'desc' } },
        take: 5
      });

      // Stats for the current month by secretaria
      const now = new Date();
      const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
      const statsMesSecretaria = await prisma.pago.groupBy({
        by: ['secretaria'],
        where: { tenantId, fecha: { gte: inicioMes } },
        _sum: { monto: true }
      });

      return res.status(200).json({ 
        pagos, 
        total, 
        stats: {
          totalPagado: stats._sum.monto || 0,
          topProveedores: topProveedores.map(p => ({ proveedor: p.proveedor, total: p._sum.monto })),
          statsMesSecretaria: statsMesSecretaria.map(s => ({ secretaria: s.secretaria, total: s._sum.monto }))
        }
      });
    }

    if (req.method === 'POST') {
      const pago = await prisma.pago.create({ data: { ...req.body, tenantId } });
      return res.status(201).json(pago);
    }

    if (req.method === 'PUT') {
      const { id, ...data } = req.body;
      const pago = await prisma.pago.update({ where: { id }, data });
      return res.status(200).json(pago);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await prisma.pago.delete({ where: { id } });
      return res.status(204).end();
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error de base de datos', details: err.message });
  }
}
