import { prisma } from '../lib/db.js';
import { cors, noStore } from '../lib/auth.js';
import bcrypt from 'bcryptjs';

const DEMO_USERS = [
  { email: 'intendente@junin.gov.ar', name: 'Pablo Intendente', role: 'INTENDENTE' },
  { email: 'admin@junin.gov.ar', name: 'Administrador Municipal', role: 'TENANT_ADMIN' },
  { email: 'contador@junin.gov.ar', name: 'María Contadora', role: 'CONTADOR' },
  { email: 'rrhh@junin.gov.ar', name: 'Laura RRHH', role: 'TENANT_USER' },
  { email: 'inspector@junin.gov.ar', name: 'Carlos Inspector', role: 'INSPECTOR' },
  { email: 'demo@junin.gov.ar', name: 'Usuario Demo', role: 'DEMO' },
];

const DEFAULT_PASSWORD = 'Junin2026!';

export default async function handler(req, res) {
  cors(req, res);
  noStore(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // 1. Ensure tenant exists and is ACTIVE
    let tenant = await prisma.tenant.findFirst({ where: { slug: 'junin' } });
    if (!tenant) {
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
          themePrimary: '#3b82f6',
          themeAccent: '#6366f1',
          themeBackground: '#060b18',
        },
      });
    } else if (tenant.status !== 'ACTIVE') {
      tenant = await prisma.tenant.update({
        where: { id: tenant.id },
        data: { status: 'ACTIVE' },
      });
    }

    // 2. Create/update demo users
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    const results = [];

    for (const u of DEMO_USERS) {
      const existing = await prisma.user.findUnique({ where: { email: u.email } });
      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { active: true, tenantId: tenant.id, role: u.role, passwordHash: hash },
        });
        results.push({ email: u.email, role: u.role, status: 'updated' });
      } else {
        await prisma.user.create({
          data: {
            email: u.email,
            passwordHash: hash,
            name: u.name,
            role: u.role,
            tenantId: tenant.id,
            active: true,
          },
        });
        results.push({ email: u.email, role: u.role, status: 'created' });
      }
    }

    return res.status(200).json({
      ok: true,
      tenant: { id: tenant.id, slug: tenant.slug, status: tenant.status },
      users: results,
      password: DEFAULT_PASSWORD,
    });
  } catch (err) {
    console.error('[SEED]', err);
    return res.status(500).json({ error: err.message });
  }
}
