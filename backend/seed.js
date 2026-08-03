// ============================================================
// seed.js — Datos iniciales del sistema
// Crea: Super Admin, Tenant Junín, Tenant Demo, usuarios
// Ejecutar: node backend/seed.js
// ============================================================

'use strict';

const bcrypt = require('bcryptjs');

async function main() {
  let prisma;
  try {
    prisma = require('./lib/prisma');
  } catch (e) {
    console.log('⚠️ Prisma no disponible. Configura DATABASE_URL y ejecuta: npx prisma migrate dev');
    console.log('\nUsuarios de demo (sin DB):');
    console.log('  👑 Super Admin: superadmin@govtech.ar / SuperAdmin2026!');
    console.log('  🏛️  Intendente: intendente@junin.gob.ar / Junin2026!');
    console.log('  💰  Hacienda:   hacienda@junin.gob.ar / Hacienda2026!');
    console.log('  🌐  Demo:       demo@demo.com / demo123');
    return;
  }

  console.log('🌱 Iniciando seed...');

  // Hash de contraseñas
  const [hashSA, hashAdmin, hashHacienda, hashIT, hashDemo] = await Promise.all([
    bcrypt.hash('SuperAdmin2026!', 12),
    bcrypt.hash('Junin2026!', 12),
    bcrypt.hash('Hacienda2026!', 12),
    bcrypt.hash('IT2026!', 12),
    bcrypt.hash('demo123', 12),
  ]);

  // 1. Super Admin (sin tenant)
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@govtech.ar' },
    update: {},
    create: {
      email: 'superadmin@govtech.ar',
      passwordHash: hashSA,
      name: 'Super Administrador GovTech',
      role: 'SUPER_ADMIN',
      tenantId: null,
    },
  });
  console.log('✅ Super Admin:', superAdmin.email);

  // 2. Tenant Junín
  const junin = await prisma.tenant.upsert({
    where: { slug: 'junin-mendoza' },
    update: {},
    create: {
      slug: 'junin-mendoza',
      name: 'Municipalidad de Junín',
      shortName: 'Junín',
      province: 'Mendoza',
      country: 'Argentina',
      population: 35000,
      employees: 1247,
      budgetAnnual: BigInt(3720000000),
      currency: 'ARS',
      timezone: 'America/Argentina/Mendoza',
      logoEmoji: '🏛️',
      themePrimary: '#3b82f6',
      themeAccent: '#6366f1',
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
      mrr: 79900,
      modules: {
        createMany: {
          skipDuplicates: true,
          data: [
            'dashboard','control','ia','rrhh','licitaciones','vecinos',
            'mapa','proveedores','talleres','servicios','upload','exportar',
            'presentacion','manuales',
          ].map(m => ({ module: m, active: true })),
        },
      },
    },
  });
  console.log('✅ Tenant Junín:', junin.id);

  // Usuarios Junín
  const usuarios = [
    { email: 'intendente@junin.gob.ar', name: 'Intendente Municipal', role: 'TENANT_ADMIN', hash: hashAdmin },
    { email: 'hacienda@junin.gob.ar', name: 'Director de Hacienda', role: 'TENANT_USER', hash: hashHacienda },
    { email: 'it@junin.gob.ar', name: 'Jefe de Tecnología', role: 'TENANT_ADMIN', hash: hashIT },
    { email: 'demo@demo.com', name: 'Usuario Demo', role: 'DEMO', hash: hashDemo },
  ];

  for (const u of usuarios) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, passwordHash: u.hash, name: u.name, role: u.role, tenantId: junin.id },
    });
    console.log(`✅ Usuario: ${u.email} (${u.role})`);
  }

  // 3. Tenant Demo
  const demo = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      slug: 'demo',
      name: 'Municipio Demo',
      shortName: 'Demo',
      province: 'Mendoza',
      country: 'Argentina',
      employees: 250,
      plan: 'DEMO',
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      modules: {
        createMany: {
          skipDuplicates: true,
          data: ['dashboard','ia','rrhh','vecinos','control'].map(m => ({ module: m, active: true })),
        },
      },
    },
  });
  console.log('✅ Tenant Demo:', demo.id);

  console.log('\n🎉 Seed completado!');
  console.log('\nCredenciales:');
  console.log('  👑 Super Admin: superadmin@govtech.ar / SuperAdmin2026!');
  console.log('  🏛️  Intendente: intendente@junin.gob.ar / Junin2026!');
  console.log('  💰  Hacienda:   hacienda@junin.gob.ar / Hacienda2026!');
  console.log('  💻  IT:         it@junin.gob.ar / IT2026!');
  console.log('  🌐  Demo:       demo@demo.com / demo123');
}

main().catch(console.error);
