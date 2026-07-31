// quick-seed.js — Seed directo usando Prisma client generado
'use strict';
const { PrismaClient } = require('./node_modules/@prisma/client');
const bcrypt = require('./backend/node_modules/bcryptjs');
const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Conectando a Neon PostgreSQL...');

  const [h1, h2, h3, h4, h5] = await Promise.all([
    bcrypt.hash('SuperAdmin2026!', 12),
    bcrypt.hash('Junin2026!', 12),
    bcrypt.hash('Hacienda2026!', 12),
    bcrypt.hash('IT2026!', 12),
    bcrypt.hash('demo123', 12),
  ]);

  // Super Admin
  const sa = await prisma.user.upsert({
    where: { email: 'superadmin@govtech.ar' },
    update: {},
    create: { email: 'superadmin@govtech.ar', passwordHash: h1, name: 'Super Admin GovTech', role: 'SUPER_ADMIN' },
  });
  console.log('✅ Super Admin:', sa.email);

  // Tenant Junín
  const junin = await prisma.tenant.upsert({
    where: { slug: 'junin-mendoza' },
    update: {},
    create: {
      slug: 'junin-mendoza', name: 'Municipalidad de Junín', shortName: 'Junín',
      province: 'Mendoza', plan: 'PROFESSIONAL', status: 'ACTIVE', mrr: 79900,
    },
  });
  console.log('✅ Tenant Junín:', junin.id);

  // Usuarios de Junín
  const users = [
    ['intendente@junin.gob.ar', 'Intendente Municipal', 'TENANT_ADMIN', h2],
    ['hacienda@junin.gob.ar', 'Director Hacienda', 'TENANT_USER', h3],
    ['it@junin.gob.ar', 'Jefe IT', 'TENANT_ADMIN', h4],
    ['demo@demo.com', 'Usuario Demo', 'DEMO', h5],
  ];

  for (const [email, name, role, hash] of users) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, passwordHash: hash, name, role, tenantId: junin.id },
    });
    console.log('✅ Usuario:', email, '(' + role + ')');
  }

  console.log('\n🎉 ¡DB lista! 5 usuarios y 1 tenant cargados en Neon.');
  console.log('\nCredenciales:');
  console.log('  👑 superadmin@govtech.ar  /  SuperAdmin2026!');
  console.log('  🏛️  intendente@junin.gob.ar  /  Junin2026!');
  console.log('  💰 hacienda@junin.gob.ar  /  Hacienda2026!');
  console.log('  💻 it@junin.gob.ar  /  IT2026!');
  console.log('  🌐 demo@demo.com  /  demo123');

  await prisma.$disconnect();
}

seed().catch(e => { console.error('❌ Seed error:', e.message); process.exit(1); });
