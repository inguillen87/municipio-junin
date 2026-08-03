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
      const { secretaria, estado, search, limit = 100, offset = 0 } = req.query;
      const where = { tenantId };
      if (secretaria) where.secretaria = secretaria;
      if (estado) where.estado = estado;
      if (search) where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { apellido: { contains: search, mode: 'insensitive' } },
        { legajo: { contains: search } },
        { cargo: { contains: search, mode: 'insensitive' } }
      ];

      const [empleados, total] = await Promise.all([
        prisma.empleado.findMany({ where, orderBy: { apellido: 'asc' }, take: parseInt(limit), skip: parseInt(offset) }),
        prisma.empleado.count({ where })
      ]);

      // Aggregate stats
      const stats = await prisma.empleado.aggregate({
        where: { tenantId, estado: 'Activo' },
        _count: { id: true },
        _sum: { salarioBruto: true },
        _avg: { salarioBruto: true }
      });

      return res.status(200).json({ empleados, total, stats: {
        totalActivos: stats._count.id,
        masaNominal: stats._sum.salarioBruto || 0,
        promedioSalario: stats._avg.salarioBruto || 0
      }});
    }

    if (req.method === 'POST') {
      const emp = await prisma.empleado.create({ data: { ...req.body, tenantId } });
      return res.status(201).json(emp);
    }

    if (req.method === 'PUT') {
      const { id, ...data } = req.body;
      const emp = await prisma.empleado.update({ where: { id }, data });
      return res.status(200).json(emp);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await prisma.empleado.delete({ where: { id } });
      return res.status(204).end();
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error de base de datos', details: err.message });
  }
}
