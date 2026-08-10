#!/usr/bin/env node
// scripts/diagnose-and-provision.mjs
// Diagnóstico de DB y provisioning de admin para MuniControl
// Uso: node scripts/diagnose-and-provision.mjs [--provision]
//
// Sin flags: solo diagnóstico (lectura)
// --provision: crea tenant ACTIVE + usuario admin si no existen

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const PROVISION_MODE = process.argv.includes('--provision');

const prisma = new PrismaClient({
  log: ['error'],
});

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(color, label, msg) {
  console.log(`${color}[${label}]${COLORS.reset} ${msg}`);
}

function ok(msg) { log(COLORS.green, '  OK  ', msg); }
function warn(msg) { log(COLORS.yellow, ' WARN ', msg); }
function fail(msg) { log(COLORS.red, ' FAIL ', msg); }
function info(msg) { log(COLORS.cyan, ' INFO ', msg); }

async function diagnose() {
  console.log(`\n${COLORS.bold}═══ MuniControl DB Diagnostic ═══${COLORS.reset}\n`);

  // 1. Check connection
  info('Conectando a la base de datos...');
  try {
    await prisma.$queryRaw`SELECT 1`;
    ok('Conexión a PostgreSQL exitosa');
  } catch (err) {
    fail(`No se pudo conectar: ${err.message}`);
    console.log(`\n${COLORS.yellow}Asegurate de tener DATABASE_URL configurada.${COLORS.reset}`);
    console.log(`Ejemplo: $env:DATABASE_URL='postgresql://user:pass@host/db?sslmode=require'\n`);
    process.exit(1);
  }

  // 2. Check JWT_SECRET
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    fail(`JWT_SECRET no configurado o menor a 32 caracteres (actual: ${jwtSecret ? jwtSecret.length : 0} chars)`);
    console.log(`${COLORS.yellow}  → El login devolverá 503 "Autenticación no configurada"${COLORS.reset}`);
  } else {
    ok(`JWT_SECRET configurado (${jwtSecret.length} chars)`);
  }

  // 3. Check tenants
  console.log(`\n${COLORS.bold}── Tenants ──${COLORS.reset}`);
  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true, name: true, status: true, trialEndsAt: true, plan: true },
  });

  if (tenants.length === 0) {
    fail('No hay tenants en la base de datos');
    console.log(`${COLORS.yellow}  → Cualquier usuario no-SUPER_ADMIN será rechazado con "Usuario sin municipio habilitado"${COLORS.reset}`);
  } else {
    for (const t of tenants) {
      const statusColor = t.status === 'ACTIVE' ? COLORS.green
        : t.status === 'TRIAL' ? COLORS.yellow
        : COLORS.red;
      const expired = t.status === 'TRIAL' && t.trialEndsAt && new Date(t.trialEndsAt) < new Date();
      console.log(`  ${statusColor}●${COLORS.reset} ${t.name} (${t.slug})`);
      console.log(`    ID: ${t.id}`);
      console.log(`    Status: ${statusColor}${t.status}${COLORS.reset}  Plan: ${t.plan}`);
      if (t.trialEndsAt) {
        console.log(`    Trial ends: ${t.trialEndsAt.toISOString()}${expired ? ` ${COLORS.red}<- EXPIRADO${COLORS.reset}` : ''}`);
      }
      if (t.status !== 'ACTIVE' && t.status !== 'TRIAL') {
        fail(`  → Tenant "${t.slug}" bloqueará login: status=${t.status}`);
      } else if (expired) {
        fail(`  → Tenant "${t.slug}" bloqueará login: trial expirado`);
      } else {
        ok(`  → Tenant "${t.slug}" permite login`);
      }
    }
  }

  // 4. Check users
  console.log(`\n${COLORS.bold}── Usuarios ──${COLORS.reset}`);
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, active: true, tenantId: true, lastLogin: true },
  });

  if (users.length === 0) {
    fail('No hay usuarios en la base de datos');
    console.log(`${COLORS.yellow}  → Login siempre fallará con 401${COLORS.reset}`);
  } else {
    for (const u of users) {
      const activeColor = u.active ? COLORS.green : COLORS.red;
      console.log(`  ${activeColor}●${COLORS.reset} ${u.email} (${u.name})`);
      console.log(`    Role: ${u.role}  Active: ${u.active}  TenantID: ${u.tenantId || 'NULL'}`);
      if (u.lastLogin) console.log(`    Last login: ${u.lastLogin.toISOString()}`);

      // Check potential issues
      if (!u.active) fail(`  → Usuario "${u.email}" está desactivado`);
      if (!u.tenantId && u.role !== 'SUPER_ADMIN') fail(`  → Usuario "${u.email}" sin tenant y no es SUPER_ADMIN`);

      const KNOWN_ROLES = ['SUPER_ADMIN', 'INTENDENTE', 'TENANT_ADMIN', 'TENANT_USER', 'CONTADOR', 'INSPECTOR', 'DEMO'];
      if (!KNOWN_ROLES.includes(u.role)) fail(`  → Usuario "${u.email}" tiene rol desconocido: ${u.role}`);
    }
  }

  // 5. Environment vars summary
  console.log(`\n${COLORS.bold}── Variables de entorno ──${COLORS.reset}`);
  const envVars = [
    'DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET',
    'GRH_TENANT_ID', 'GRH_SOURCE_SHA256', 'LEGACY_ANALYTICS_TENANT_ID',
    'PUBLIC_APP_URL', 'PUBLIC_APP_ORIGINS', 'NODE_ENV',
  ];
  for (const v of envVars) {
    const val = process.env[v];
    if (!val) {
      warn(`${v}: no configurada`);
    } else if (v.includes('SECRET') || v.includes('URL') || v.includes('DATABASE')) {
      ok(`${v}: configurada (${val.length} chars)`);
    } else {
      ok(`${v}: ${val}`);
    }
  }

  return { tenants, users };
}

async function provision() {
  console.log(`\n${COLORS.bold}═══ Provisioning Mode ═══${COLORS.reset}\n`);

  // Check/create JWT_SECRET
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    const newSecret = crypto.randomBytes(48).toString('base64url');
    warn(`JWT_SECRET no configurada. Generé una nueva:`);
    console.log(`\n  ${COLORS.cyan}$env:JWT_SECRET='${newSecret}'${COLORS.reset}\n`);
    console.log(`  Agregala como variable de entorno en Vercel y localmente.\n`);
  }

  // Check/create tenant
  let tenant = await prisma.tenant.findFirst({ where: { slug: 'junin' } });
  if (!tenant) {
    info('Creando tenant "Municipalidad de Junín"...');
    tenant = await prisma.tenant.create({
      data: {
        slug: 'junin',
        name: 'Municipalidad de Junín',
        shortName: 'Junín',
        province: 'Buenos Aires',
        country: 'Argentina',
        population: 100000,
        plan: 'PROFESSIONAL',
        status: 'ACTIVE',
        contactEmail: 'admin@junin.gob.ar',
      },
    });
    ok(`Tenant creado: ${tenant.id}`);
  } else if (tenant.status !== 'ACTIVE') {
    info(`Activando tenant "${tenant.slug}" (era ${tenant.status})...`);
    tenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: { status: 'ACTIVE' },
    });
    ok(`Tenant activado: ${tenant.slug}`);
  } else {
    ok(`Tenant "${tenant.slug}" ya existe y está ACTIVE`);
  }

  // Check/create admin user
  const adminEmail = 'admin@junin.gov.ar';
  let user = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!user) {
    const tempPassword = 'MuniControl2026!';
    const hash = await bcrypt.hash(tempPassword, 12);
    info(`Creando usuario admin ${adminEmail}...`);
    user = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: hash,
        name: 'Administrador Municipal',
        role: 'TENANT_ADMIN',
        tenantId: tenant.id,
        active: true,
      },
    });
    ok(`Usuario creado: ${user.id}`);
    console.log(`\n${COLORS.bold}${COLORS.green}  Credenciales de acceso:${COLORS.reset}`);
    console.log(`    Email:    ${COLORS.cyan}${adminEmail}${COLORS.reset}`);
    console.log(`    Password: ${COLORS.cyan}${tempPassword}${COLORS.reset}`);
    console.log(`\n${COLORS.yellow}  Cambia la contrasena despues del primer login.${COLORS.reset}\n`);
  } else {
    if (!user.active) {
      await prisma.user.update({ where: { id: user.id }, data: { active: true } });
      ok(`Usuario "${adminEmail}" reactivado`);
    }
    if (!user.tenantId) {
      await prisma.user.update({ where: { id: user.id }, data: { tenantId: tenant.id } });
      ok(`Usuario "${adminEmail}" vinculado al tenant`);
    }
    ok(`Usuario "${adminEmail}" ya existe (role: ${user.role})`);
  }

  // Also check for GRH_TENANT_ID and LEGACY_ANALYTICS_TENANT_ID
  if (!process.env.GRH_TENANT_ID) {
    warn(`GRH_TENANT_ID no configurada. Necesitas:`);
    console.log(`  ${COLORS.cyan}$env:GRH_TENANT_ID='${tenant.id}'${COLORS.reset}`);
  }
  if (!process.env.LEGACY_ANALYTICS_TENANT_ID) {
    warn(`LEGACY_ANALYTICS_TENANT_ID no configurada. Necesitas:`);
    console.log(`  ${COLORS.cyan}$env:LEGACY_ANALYTICS_TENANT_ID='${tenant.id}'${COLORS.reset}`);
  }
}

async function main() {
  try {
    const { tenants, users } = await diagnose();

    if (PROVISION_MODE) {
      await provision();
    } else if (tenants.length === 0 || users.length === 0) {
      console.log(`\n${COLORS.yellow}Para crear tenant + usuario admin, ejecuta:${COLORS.reset}`);
      console.log(`  ${COLORS.cyan}node scripts/diagnose-and-provision.mjs --provision${COLORS.reset}\n`);
    }

    console.log(`\n${COLORS.bold}=== Diagnostico completo ===${COLORS.reset}\n`);
  } catch (err) {
    fail(`Error: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
