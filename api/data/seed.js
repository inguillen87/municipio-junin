import { prisma } from '../lib/db.js';
import { cors } from '../lib/auth.js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const passwordHash = await bcrypt.hash('Junin2026!', 10);
    
    // 1. Create or update tenant
    const tenant = await prisma.tenant.upsert({
      where: { slug: 'junin' },
      update: { name: 'Municipalidad de Junin', shortName: 'Junin', province: 'Buenos Aires' },
      create: { slug: 'junin', name: 'Municipalidad de Junin', shortName: 'Junin', province: 'Buenos Aires', active: true }
    });

    const tenantId = tenant.id;

    // 2. Create users
    const usersData = [
      { email: 'admin@junin.gov.ar', name: 'Admin', role: 'TENANT_ADMIN' },
      { email: 'intendente@junin.gov.ar', name: 'Intendente', role: 'INTENDENTE' },
      { email: 'contador@junin.gov.ar', name: 'Contador', role: 'CONTADOR' },
      { email: 'demo@junin.gov.ar', name: 'Demo User', role: 'DEMO' },
    ];

    for (const u of usersData) {
      await prisma.user.upsert({
        where: { email: u.email },
        update: { passwordHash, tenantId, role: u.role, name: u.name },
        create: { email: u.email, name: u.name, role: u.role, passwordHash, tenantId, active: true }
      });
    }

    // 3. Empleados (30)
    const secretarias = ['Obras Publicas', 'Hacienda', 'Salud', 'Educacion', 'Seguridad', 'Servicios'];
    await prisma.empleado.deleteMany({ where: { tenantId } });
    
    for(let i = 1; i <= 30; i++) {
      await prisma.empleado.create({
        data: {
          tenantId,
          legajo: `EMP${String(i).padStart(4, '0')}`,
          nombre: `Nombre${i}`,
          apellido: `Apellido${i}`,
          dni: String(20000000 + i),
          secretaria: secretarias[i % secretarias.length],
          cargo: i % 3 === 0 ? 'Director' : 'Administrativo',
          estado: i % 10 === 0 ? 'Licencia' : 'Activo',
          fechaIngreso: new Date(2020 + (i % 4), i % 12, 1),
          salarioBruto: 300000 + (i * 10000)
        }
      });
    }

    // 4. Pagos (25)
    await prisma.pago.deleteMany({ where: { tenantId } });
    for(let i = 1; i <= 25; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (i * 3));
      await prisma.pago.create({
        data: {
          tenantId,
          fecha: date,
          proveedor: `Proveedor CUIT 30-7000000${i}-9`,
          monto: 50000 + (i * 20000),
          concepto: `Insumos varios ${i}`,
          secretaria: secretarias[i % secretarias.length],
          estado: i % 5 === 0 ? 'Pendiente' : 'Pagado',
          expediente: `EXP-2026-${i}`
        }
      });
    }

    // 5. Presupuestos (8)
    await prisma.presupuesto.deleteMany({ where: { tenantId } });
    for (const sec of secretarias) {
      await prisma.presupuesto.create({
        data: {
          tenantId,
          periodo: '2026-08',
          secretaria: sec,
          asignado: 10000000 + (Math.random() * 5000000),
          ejecutado: 2000000 + (Math.random() * 4000000)
        }
      });
    }

    // 6. Reclamos (15)
    const reclamoCategorias = ['Alumbrado', 'Bacheo', 'Basura', 'Ruidos', 'Arbolado'];
    const estados = ['Pendiente', 'En proceso', 'Resuelto', 'Cerrado'];
    await prisma.reclamo.deleteMany({ where: { tenantId } });
    for(let i = 1; i <= 15; i++) {
      await prisma.reclamo.create({
        data: {
          tenantId,
          numero: `R${String(i).padStart(6, '0')}`,
          ciudadanoNombre: `Ciudadano ${i}`,
          descripcion: `Problema con ${reclamoCategorias[i % reclamoCategorias.length]} en mi calle`,
          categoria: reclamoCategorias[i % reclamoCategorias.length],
          barrio: `Barrio ${i % 5}`,
          estado: estados[i % estados.length],
        }
      });
    }

    // 7. Obras (8)
    await prisma.obra.deleteMany({ where: { tenantId } });
    for(let i = 1; i <= 8; i++) {
      await prisma.obra.create({
        data: {
          tenantId,
          nombre: `Obra Mejora ${i}`,
          descripcion: `Pavimentacion y luces etapa ${i}`,
          estado: i % 3 === 0 ? 'Finalizada' : 'En ejecucion',
          presupuesto: 50000000 + (i * 1000000),
          avancePct: i % 3 === 0 ? 100 : (i * 10),
          lat: -34.58 + (Math.random() * 0.05),
          lng: -60.94 + (Math.random() * 0.05)
        }
      });
    }

    // 8. Licitaciones (5)
    await prisma.licitacion.deleteMany({ where: { tenantId } });
    for(let i = 1; i <= 5; i++) {
      await prisma.licitacion.create({
        data: {
          tenantId,
          numero: `L${String(i).padStart(4, '0')}-26`,
          titulo: `Licitacion Publica ${i}`,
          estado: i % 2 === 0 ? 'Abierta' : 'Adjudicada',
          presupuesto: 15000000 + (i * 5000000),
          fechaCierre: new Date(new Date().getTime() + (i * 86400000 * 5))
        }
      });
    }

    return res.status(200).json({ message: 'Seed completado exitosamente para Junin' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error durante el seeding', details: err.message });
  }
}
