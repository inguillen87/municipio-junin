// ============================================================
// admin.js — API Super Admin
// Solo accesible con rol SUPER_ADMIN
// CRUD: Tenants, Users, Modules, Stats
// ============================================================

'use strict';

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { isSuperAdmin } = require('../middleware/authMiddleware');

let prisma;
try {
  prisma = require('../lib/prisma');
} catch (e) {
  prisma = null;
}

// ── DEMO DATA (cuando Prisma no está disponible) ────────────
const DEMO_TENANTS = [
  {
    id: 't_junin',
    slug: 'junin-mendoza',
    name: 'Municipalidad de Junín',
    shortName: 'Junín',
    province: 'Mendoza',
    country: 'Argentina',
    employees: 1247,
    plan: 'PROFESSIONAL',
    status: 'ACTIVE',
    mrr: 79900,
    createdAt: '2026-07-01T00:00:00Z',
    users: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }],
  },
  {
    id: 't_demo',
    slug: 'demo',
    name: 'Municipio Demo',
    shortName: 'Demo',
    province: 'Mendoza',
    country: 'Argentina',
    employees: 250,
    plan: 'DEMO',
    status: 'TRIAL',
    mrr: 0,
    createdAt: '2026-07-15T00:00:00Z',
    users: [{ id: 'u4' }],
  },
];

const DEMO_STATS = {
  totalTenants: 2,
  activeTenants: 1,
  trialTenants: 1,
  totalUsers: 4,
  mrrTotal: 79900,
  mrrFormatted: '$799',
  arrEstimated: 958800,
  tenantsThisMonth: 1,
  topPlan: 'PROFESSIONAL',
};

// ── STATS GENERALES ──────────────────────────────────────────
router.get('/stats', ...isSuperAdmin, async (req, res) => {
  try {
    if (!prisma) return res.json({ ok: true, source: 'demo', data: DEMO_STATS });
    const [tenants, users] = await Promise.all([
      prisma.tenant.findMany({ include: { _count: { select: { users: true } } } }),
      prisma.user.count(),
    ]);
    const mrr = tenants.reduce((sum, t) => sum + (t.mrr || 0), 0);
    res.json({
      ok: true,
      source: 'postgresql',
      data: {
        totalTenants: tenants.length,
        activeTenants: tenants.filter(t => t.status === 'ACTIVE').length,
        trialTenants: tenants.filter(t => t.status === 'TRIAL').length,
        totalUsers: users,
        mrrTotal: mrr,
        mrrFormatted: `$${(mrr / 100).toFixed(0)}`,
        arrEstimated: mrr * 12,
      },
    });
  } catch (err) {
    res.json({ ok: true, source: 'demo', data: DEMO_STATS, warning: err.message });
  }
});

// ── LISTAR TENANTS ───────────────────────────────────────────
router.get('/tenants', ...isSuperAdmin, async (req, res) => {
  try {
    if (!prisma) return res.json({ ok: true, source: 'demo', data: DEMO_TENANTS });
    const tenants = await prisma.tenant.findMany({
      include: { _count: { select: { users: true } }, modules: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ ok: true, source: 'postgresql', data: tenants });
  } catch (err) {
    res.json({ ok: true, source: 'demo', data: DEMO_TENANTS });
  }
});

// ── CREAR TENANT ─────────────────────────────────────────────
router.post('/tenants', ...isSuperAdmin, async (req, res) => {
  const { name, shortName, slug, province, country, plan, employees, adminEmail, adminName, adminPassword } = req.body;
  if (!name || !slug || !adminEmail) {
    return res.status(400).json({ error: 'Faltan campos requeridos: name, slug, adminEmail' });
  }
  try {
    if (!prisma) {
      return res.json({
        ok: true,
        source: 'demo',
        data: { id: 't_' + Date.now(), slug, name, status: 'TRIAL', plan: plan || 'TRIAL', createdAt: new Date().toISOString() },
        message: 'Tenant creado en modo demo. Conectar Prisma + Neon para persistencia real.',
      });
    }
    const hash = await bcrypt.hash(adminPassword || 'Admin2026!', 12);
    const tenant = await prisma.tenant.create({
      data: {
        slug, name, shortName: shortName || name, province, country: country || 'Argentina',
        employees: employees ? parseInt(employees) : null,
        plan: plan || 'TRIAL',
        status: 'TRIAL',
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        users: {
          create: {
            email: adminEmail,
            passwordHash: hash,
            name: adminName || 'Administrador',
            role: 'TENANT_ADMIN',
          },
        },
        modules: {
          createMany: {
            data: ['dashboard','rrhh','vecinos','control','ia','exportar'].map(m => ({ module: m, active: true })),
          },
        },
      },
      include: { users: true, modules: true },
    });
    res.json({ ok: true, source: 'postgresql', data: tenant });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'El slug ya existe. Usar otro identificador.' });
    res.status(500).json({ error: err.message });
  }
});

// ── ACTUALIZAR TENANT ─────────────────────────────────────────
router.put('/tenants/:id', ...isSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  try {
    if (!prisma) return res.json({ ok: true, source: 'demo', data: { id, ...data } });
    const tenant = await prisma.tenant.update({ where: { id }, data, include: { _count: { select: { users: true } } } });
    res.json({ ok: true, source: 'postgresql', data: tenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SUSPENDER / ACTIVAR TENANT ───────────────────────────────
router.patch('/tenants/:id/status', ...isSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ['ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  try {
    if (!prisma) return res.json({ ok: true, source: 'demo', data: { id, status } });
    const tenant = await prisma.tenant.update({ where: { id }, data: { status } });
    res.json({ ok: true, data: tenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── LISTAR TODOS LOS USUARIOS ─────────────────────────────────
router.get('/users', ...isSuperAdmin, async (req, res) => {
  try {
    if (!prisma) {
      return res.json({
        ok: true, source: 'demo',
        data: [
          { id: 'u_sa', email: 'superadmin@govtech.ar', name: 'Super Admin', role: 'SUPER_ADMIN', tenantId: null, active: true },
          { id: 'u_j1', email: 'intendente@junin.gob.ar', name: 'Intendente Junín', role: 'TENANT_ADMIN', tenantId: 't_junin', tenant: { name: 'Junín' }, active: true },
          { id: 'u_j2', email: 'hacienda@junin.gob.ar', name: 'Hacienda', role: 'TENANT_USER', tenantId: 't_junin', tenant: { name: 'Junín' }, active: true },
          { id: 'u_dm', email: 'demo@demo.com', name: 'Demo User', role: 'DEMO', tenantId: 't_demo', tenant: { name: 'Demo' }, active: true },
        ],
      });
    }
    const users = await prisma.user.findMany({
      include: { tenant: { select: { name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ ok: true, source: 'postgresql', data: users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CREAR USUARIO ─────────────────────────────────────────────
router.post('/users', ...isSuperAdmin, async (req, res) => {
  const { email, password, name, role, tenantId } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'email, password y name son requeridos' });
  try {
    if (!prisma) {
      return res.json({ ok: true, source: 'demo', data: { id: 'u_' + Date.now(), email, name, role, tenantId, active: true } });
    }
    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash: hash, name, role: role || 'TENANT_USER', tenantId: tenantId || null },
      include: { tenant: { select: { name: true } } },
    });
    res.json({ ok: true, source: 'postgresql', data: { ...user, passwordHash: undefined } });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'El email ya existe' });
    res.status(500).json({ error: err.message });
  }
});

// ── ACTUALIZAR MÓDULOS DE UN TENANT ──────────────────────────
router.put('/tenants/:id/modules', ...isSuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { modules } = req.body; // Array de { module, active }
  try {
    if (!prisma) return res.json({ ok: true, source: 'demo', data: modules });
    const results = await Promise.all(
      modules.map(m => prisma.tenantModule.upsert({
        where: { tenantId_module: { tenantId: id, module: m.module } },
        update: { active: m.active },
        create: { tenantId: id, module: m.module, active: m.active },
      }))
    );
    res.json({ ok: true, data: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AUDIT LOGS ────────────────────────────────────────────────
router.get('/audit', ...isSuperAdmin, async (req, res) => {
  try {
    if (!prisma) return res.json({ ok: true, source: 'demo', data: [] });
    const logs = await prisma.auditLog.findMany({
      include: { user: { select: { name: true, email: true } }, tenant: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ ok: true, data: logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
