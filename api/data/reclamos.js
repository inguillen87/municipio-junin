import { prisma } from '../lib/db.js';
import { requireAuth, cors } from '../lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Allow public access for citizen portal if public=1 is passed and a specific ticket number is requested
  let tenantId = null;
  const isPublic = req.query.public === '1' && req.query.numero;
  
  if (!isPublic) {
    const user = requireAuth(req, res);
    if (!user) return;
    tenantId = user.tenantId;
  }

  try {
    if (req.method === 'GET') {
      if (isPublic) {
        const reclamo = await prisma.reclamo.findFirst({
          where: { numero: req.query.numero }
        });
        if (!reclamo) return res.status(404).json({ error: 'Reclamo no encontrado' });
        // Return limited data for public view
        return res.status(200).json({
          numero: reclamo.numero,
          estado: reclamo.estado,
          fecha: reclamo.createdAt,
          categoria: reclamo.categoria,
          barrio: reclamo.barrio,
          observaciones: reclamo.observaciones
        });
      }

      const { estado, categoria, barrio, search, limit = 100, offset = 0 } = req.query;
      const where = { tenantId };
      
      if (estado) where.estado = estado;
      if (categoria) where.categoria = categoria;
      if (barrio) where.barrio = barrio;
      
      if (search) {
        where.OR = [
          { numero: { contains: search, mode: 'insensitive' } },
          { descripcion: { contains: search, mode: 'insensitive' } },
          { ciudadanoNombre: { contains: search, mode: 'insensitive' } }
        ];
      }

      const [reclamos, total] = await Promise.all([
        prisma.reclamo.findMany({ where, orderBy: { createdAt: 'desc' }, take: parseInt(limit), skip: parseInt(offset) }),
        prisma.reclamo.count({ where })
      ]);

      const statsConteoEstado = await prisma.reclamo.groupBy({
        by: ['estado'],
        where: { tenantId },
        _count: { id: true }
      });

      // Calculate simple SLA approx (cerrados)
      const totalCerrados = await prisma.reclamo.count({ where: { tenantId, estado: 'Cerrado' } });
      const totalReclamos = await prisma.reclamo.count({ where: { tenantId } });
      const slaPct = totalReclamos > 0 ? (totalCerrados / totalReclamos) * 100 : 0;

      return res.status(200).json({ 
        reclamos, 
        total,
        stats: {
          conteoPorEstado: statsConteoEstado.map(s => ({ estado: s.estado, count: s._count.id })),
          slaPct: Math.round(slaPct)
        }
      });
    }

    if (req.method === 'POST') {
      // Auto-numbering RXXXXXX
      const count = await prisma.reclamo.count({ where: { tenantId } });
      const numero = `R${String(count + 1).padStart(6, '0')}`;
      
      const reclamo = await prisma.reclamo.create({ 
        data: { ...req.body, tenantId, numero } 
      });
      return res.status(201).json(reclamo);
    }

    if (req.method === 'PUT') {
      const { id, estado, agenteAsignado, observaciones } = req.body;
      const updateData = {};
      if (estado) updateData.estado = estado;
      if (agenteAsignado !== undefined) updateData.agenteAsignado = agenteAsignado;
      if (observaciones !== undefined) updateData.observaciones = observaciones;
      
      const reclamo = await prisma.reclamo.update({ where: { id }, data: updateData });
      return res.status(200).json(reclamo);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await prisma.reclamo.delete({ where: { id } });
      return res.status(204).end();
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error de base de datos', details: err.message });
  }
}
