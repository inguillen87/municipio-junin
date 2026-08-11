'use strict';

const express = require('express');
const { isSuperAdmin } = require('../middleware/authMiddleware');

const router = express.Router();
const GRH_DIRECTORY_SNAPSHOT_PAYLOAD_ACTION = 'GRH_DIRECTORY_SNAPSHOT_PAYLOAD_V1';
const GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_ACTION =
  'GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_V1';
const PRIVATE_SNAPSHOT_PAYLOAD_ACTIONS = Object.freeze([
  GRH_DIRECTORY_SNAPSHOT_PAYLOAD_ACTION,
  GRH_WORKFORCE_FINANCE_SNAPSHOT_PAYLOAD_ACTION,
]);
let prisma;
try { prisma = require('../lib/prisma'); } catch { prisma = null; }

function requirePrisma(res) {
  if (prisma) return true;
  res.status(503).json({ error: 'Persistencia no configurada' });
  return false;
}

router.get('/stats', ...isSuperAdmin, async (req, res) => {
  if (!requirePrisma(res)) return;
  try {
    const [totalTenants, activeTenants, trialTenants, totalUsers] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      prisma.tenant.count({ where: { status: 'TRIAL' } }),
      prisma.user.count(),
    ]);
    return res.json({
      ok: true,
      source: 'postgresql',
      data: { totalTenants, activeTenants, trialTenants, totalUsers },
    });
  } catch (error) {
    console.error('[ADMIN-STATS]', error.message);
    return res.status(503).json({ error: 'No se pudieron consultar las estadísticas' });
  }
});

router.get('/tenants', ...isSuperAdmin, async (req, res) => {
  if (!requirePrisma(res)) return;
  try {
    const tenants = await prisma.tenant.findMany({
      include: {
        _count: { select: { users: true, empleados: true, pagos: true, reclamos: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ ok: true, source: 'postgresql', data: tenants });
  } catch (error) {
    console.error('[ADMIN-TENANTS]', error.message);
    return res.status(503).json({ error: 'No se pudieron consultar los municipios' });
  }
});

router.post('/tenants', ...isSuperAdmin, (req, res) => {
  return res.status(410).json({
    error: 'Aprovisionamiento retirado hasta habilitar invitaciones, expiración, MFA y doble aprobación',
    code: 'ACCOUNT_LIFECYCLE_NOT_GOVERNED',
  });
});

router.put('/tenants/:id', ...isSuperAdmin, (_req, res) => {
  return res.status(410).json({
    error: 'La modificación de municipios requiere doble aprobación y auditoría transaccional.',
    code: 'TENANT_LIFECYCLE_NOT_GOVERNED',
  });
});

router.patch('/tenants/:id/status', ...isSuperAdmin, (_req, res) => {
  return res.status(410).json({
    error: 'El cambio de estado municipal requiere doble aprobación y auditoría transaccional.',
    code: 'TENANT_LIFECYCLE_NOT_GOVERNED',
  });
});

router.get('/users', ...isSuperAdmin, async (req, res) => {
  if (!requirePrisma(res)) return;
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, email: true, name: true, role: true, tenantId: true, active: true,
        lastLogin: true, createdAt: true, tenant: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ ok: true, source: 'postgresql', data: users });
  } catch (error) {
    console.error('[ADMIN-USERS]', error.message);
    return res.status(503).json({ error: 'No se pudieron consultar los usuarios' });
  }
});

router.post('/users', ...isSuperAdmin, (req, res) => {
  return res.status(410).json({
    error: 'Alta con contraseña administrativa retirada; use el futuro flujo de invitación gobernada',
    code: 'ACCOUNT_LIFECYCLE_NOT_GOVERNED',
  });
});

router.put('/tenants/:id/modules', ...isSuperAdmin, (req, res) => {
  return res.status(410).json({ error: 'Gestión de módulos no disponible hasta versionar su modelo de datos' });
});

router.get('/audit', ...isSuperAdmin, async (req, res) => {
  if (!requirePrisma(res)) return;
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        action: { notIn: PRIVATE_SNAPSHOT_PAYLOAD_ACTIONS },
      },
      include: { user: { select: { name: true, email: true } }, tenant: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    // Defense in depth: even if a mock, proxy, or future persistence adapter
    // ignores the query predicate, a private snapshot envelope is never emitted.
    const serializableLogs = logs.filter(
      log => !PRIVATE_SNAPSHOT_PAYLOAD_ACTIONS.includes(log?.action),
    );
    return res.json({ ok: true, source: 'postgresql', data: serializableLogs });
  } catch (error) {
    console.error('[ADMIN-AUDIT]', error.message);
    return res.status(503).json({ error: 'No se pudo consultar la auditoría' });
  }
});

module.exports = router;
