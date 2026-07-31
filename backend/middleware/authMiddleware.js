// ============================================================
// authMiddleware.js — JWT + Role-Based Access Control
// Roles: SUPER_ADMIN > TENANT_ADMIN > TENANT_USER > DEMO
// ============================================================

'use strict';

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'govtech-jwt-secret-change-in-production';

// ── JERARQUÍA DE ROLES ──────────────────────────────────────
const ROLE_HIERARCHY = {
  SUPER_ADMIN:  100,
  TENANT_ADMIN:  60,
  TENANT_USER:   30,
  DEMO:          10,
};

function hasRole(userRole, requiredRole) {
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[requiredRole] || 0);
}

// ── MIDDLEWARE: Verificar JWT ────────────────────────────────
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Sesión expirada' : 'Token inválido';
    return res.status(401).json({ error: msg });
  }
}

// ── MIDDLEWARE: Requerir rol mínimo ─────────────────────────
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (!hasRole(req.user.role, role)) {
      return res.status(403).json({
        error: `Acceso denegado. Se requiere rol: ${role}`,
        yourRole: req.user.role,
      });
    }
    next();
  };
}

// ── MIDDLEWARE: Verificar acceso al tenant ───────────────────
function requireTenantAccess(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  // Super admin puede acceder a cualquier tenant
  if (req.user.role === 'SUPER_ADMIN') return next();
  // Otros usuarios solo pueden acceder a su propio tenant
  const tenantId = req.params.tenantId || req.body.tenantId;
  if (tenantId && tenantId !== req.user.tenantId) {
    return res.status(403).json({ error: 'Acceso denegado a este tenant' });
  }
  next();
}

// ── SHORTCUTS ────────────────────────────────────────────────
const isSuperAdmin = [authenticate, requireRole('SUPER_ADMIN')];
const isTenantAdmin = [authenticate, requireRole('TENANT_ADMIN')];
const isUser = [authenticate, requireRole('TENANT_USER')];

module.exports = { authenticate, requireRole, requireTenantAccess, isSuperAdmin, isTenantAdmin, isUser, hasRole };
