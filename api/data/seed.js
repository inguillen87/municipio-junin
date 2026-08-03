import { prisma } from '../lib/db.js';
import { cors } from '../lib/auth.js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const passwordHash = await bcrypt.hash('Junin2026!', 10);
    const secretarias = ['Obras Publicas', 'Hacienda', 'Salud', 'Educacion', 'Seguridad', 'Servicios'];

    // 1. Tenant
    const tenant = await prisma.tenant.upsert({
      where: { slug: 'junin' },
      update: { name: 'Municipalidad de Junin', shortName: 'Junin', province: 'Mendoza' },
      create: { slug: 'junin', name: 'Municipalidad de Junin', shortName: 'Junin', province: 'Mendoza', plan: 'DEMO', status: 'TRIAL' }
    });
    const tenantId = tenant.id;

    // 2. Users
    const usersData = [
      { email: 'admin@junin.gov.ar', name: 'Administrador', role: 'TENANT_ADMIN' },
      { email: 'intendente@junin.gov.ar', name: 'Sr. Intendente', role: 'INTENDENTE' },
      { email: 'contador@junin.gov.ar', name: 'Cont. General', role: 'CONTADOR' },
      { email: 'demo@junin.gov.ar', name: 'Usuario Demo', role: 'DEMO' },
    ];
    for (const u of usersData) {
      await prisma.user.upsert({
        where: { email: u.email },
        update: { passwordHash, tenantId, role: u.role, name: u.name },
        create: { email: u.email, name: u.name, role: u.role, passwordHash, tenantId }
      });
    }

    // 3. Empleados (30)
    await prisma.empleado.deleteMany({ where: { tenantId } });
    const cargos = ['Director', 'Administrativo', 'Inspector', 'Tecnico', 'Profesional'];
    const nombres = ['Carlos','Maria','Jorge','Ana','Luis','Sandra','Pablo','Laura','Diego','Claudia'];
    const apellidos = ['Garcia','Lopez','Martinez','Rodriguez','Fernandez','Perez','Gomez','Diaz','Ruiz','Torres'];
    for(let i = 1; i <= 30; i++) {
      await prisma.empleado.create({
        data: {
          tenantId,
          legajo: `EMP${String(i).padStart(4,'0')}`,
          nombre: nombres[i % nombres.length],
          apellido: apellidos[(i+3) % apellidos.length],
          dni: String(20000000 + i * 137),
          secretaria: secretarias[i % secretarias.length],
          cargo: cargos[i % cargos.length],
          categoria: `Cat-${(i % 5) + 1}`,
          tipoContrato: i % 7 === 0 ? 'Contratado' : 'Planta Permanente',
          estado: i % 10 === 0 ? 'Licencia' : 'Activo',
          fechaIngreso: new Date(2018 + (i % 6), i % 12, 1),
          salarioBruto: 280000 + (i * 12000),
          salarioNeto: 210000 + (i * 9000)
        }
      });
    }

    // 4. Pagos (25)
    await prisma.pago.deleteMany({ where: { tenantId } });
    const proveedores = ['Construar SA','Materiales Norte SRL','Electrica Sur SA','Limpieza Urbana SRL','Servicios Viales SA'];
    for(let i = 1; i <= 25; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (i * 3));
      await prisma.pago.create({
        data: {
          tenantId,
          numero: `OP-2026-${String(i).padStart(4,'0')}`,
          fecha: date,
          proveedor: proveedores[i % proveedores.length],
          cuit: `30-7000000${i}-9`,
          monto: 80000 + (i * 25000),
          concepto: `Provision de materiales y servicios - partida ${i}`,
          secretaria: secretarias[i % secretarias.length],
          estado: i % 5 === 0 ? 'Pendiente' : 'Pagado'
        }
      });
    }

    // 5. Presupuestos (6)
    await prisma.presupuesto.deleteMany({ where: { tenantId } });
    const montos = [48000000, 32000000, 28000000, 18000000, 22000000, 15000000];
    const ejec = [0.78, 0.65, 0.72, 0.55, 0.88, 0.60];
    for(let s = 0; s < secretarias.length; s++) {
      await prisma.presupuesto.create({
        data: {
          tenantId,
          periodo: '2026-08',
          secretaria: secretarias[s],
          asignado: montos[s],
          ejecutado: Math.floor(montos[s] * ejec[s])
        }
      });
    }

    // 6. Reclamos (15)
    const cats = ['Alumbrado','Bacheo','Basura','Ruidos molestos','Arbolado','Agua potable','Cloacas'];
    const rEstados = ['Pendiente','En proceso','Resuelto','Cerrado'];
    const barrios = ['Centro','Barrio Norte','La Union','Villa del Parque','San Martin','Oeste','Los Aromos'];
    await prisma.reclamo.deleteMany({ where: { tenantId } });
    for(let i = 1; i <= 15; i++) {
      await prisma.reclamo.create({
        data: {
          tenantId,
          numero: `R${String(i).padStart(6,'0')}`,
          nombre: `${nombres[i%nombres.length]} ${apellidos[i%apellidos.length]}`,
          telefono: `2364${String(400000+i)}`,
          descripcion: `Reclamo por problema de ${cats[i%cats.length]} en la via publica`,
          categoria: cats[i % cats.length],
          barrio: barrios[i % barrios.length],
          domicilio: `Calle ${i*7} N${i*23}`,
          estado: rEstados[i % rEstados.length],
          prioridad: i % 4 === 0 ? 'Alta' : i % 3 === 0 ? 'Baja' : 'Media',
          lat: -34.5836 + (i * 0.0018),
          lng: -60.9445 + (i * 0.0022)
        }
      });
    }

    // 7. Obras (8)
    const obraNames = ['Pavimentacion Barrio Norte','Luminaria LED Av. San Martin','Plaza Nueva Villa','Bacheo Zona Sur','Red Cloacal Este','Salon Cultural Centro','Repavimentacion Acceso Norte','Parque Lineal'];
    await prisma.obra.deleteMany({ where: { tenantId } });
    for(let i = 0; i < 8; i++) {
      await prisma.obra.create({
        data: {
          tenantId,
          nombre: obraNames[i],
          descripcion: `Proyecto de mejoramiento urbano en zona ${i+1}`,
          contratista: proveedores[i % proveedores.length],
          monto: 15000000 + (i * 8000000),
          avance: i === 7 ? 100 : (i+1) * 12,
          estado: i === 7 ? 'Finalizada' : 'En ejecucion',
          barrio: barrios[i % barrios.length],
          lat: -34.5836 + (i * 0.005),
          lng: -60.9445 + (i * 0.006),
          fechaInicio: new Date(2026, 2, 1 + i*5)
        }
      });
    }

    // 8. Licitaciones (5)
    await prisma.licitacion.deleteMany({ where: { tenantId } });
    const licObjetos = [
      'Pavimentacion de calles - Zona Norte',
      'Provision de luminaria LED para el partido',
      'Construccion de salon comunitario',
      'Servicio de recoleccion de residuos',
      'Bacheo y mantenimiento vial'
    ];
    for(let i = 0; i < 5; i++) {
      await prisma.licitacion.create({
        data: {
          tenantId,
          numero: `LP${String(i+1).padStart(4,'0')}-2026`,
          objeto: licObjetos[i],
          tipo: 'Licitacion Publica',
          estado: i % 2 === 0 ? 'Adjudicada' : 'Abierta',
          montoBase: 12000000 + (i * 8000000),
          adjudicadoA: i % 2 === 0 ? proveedores[i % proveedores.length] : null,
          montoAdjudicado: i % 2 === 0 ? 11500000 + (i * 7500000) : null,
          fechaApertura: new Date(2026, 5 + i, 15),
          secretaria: secretarias[i % secretarias.length]
        }
      });
    }

    return res.status(200).json({
      message: 'Seed completado exitosamente',
      tenant: { id: tenantId, slug: 'junin' },
      counts: { empleados: 30, pagos: 25, presupuestos: 6, reclamos: 15, obras: 8, licitaciones: 5, usuarios: 4 }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error durante el seeding', details: err.message });
  }
}