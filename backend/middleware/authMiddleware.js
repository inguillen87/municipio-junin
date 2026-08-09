// ============================================================
// authMiddleware.js — JWT + Role-Based Access Control
// Exact roles only. Institutional rank never grants technical privileges.
// ============================================================

'use strict';

const jwt = require('jsonwebtoken');
const { hasExactRole, isKnownRole } = require('../../shared/access-policy.cjs');
const routePolicy = require('../../shared/route-policy.cjs');
const { evaluateTenantAccess } = require('../../shared/tenant-lifecycle.cjs');
let prisma;
try { prisma = require('../lib/prisma'); } catch { prisma = null; }

const {
  RUNTIMES,
  authorizeRoute,
  hasResourceAction,
  resolveProtectedRoute,
} = routePolicy;

const MIN_JWT_SECRET_LENGTH = 32;
const requestAuthCache = new WeakMap();

// ── COINCIDENCIA EXACTA DE ROLES ────────────────────────────
function hasRole(userRole, requiredRole) {
  return hasExactRole(userRole, requiredRole);
}

function requestRoutePath(req) {
  const pathname = req?.originalUrl || req?.url;
  return typeof pathname === 'string' && pathname.length > 0 ? pathname : null;
}

function denyRoutePermission(res) {
  return res.status(403).json({
    error: 'Operacion no habilitada para este perfil',
    code: 'ROUTE_PERMISSION_DENIED',
  });
}

function enforceCurrentRoutePermission(req, res, user) {
  const pathname = requestRoutePath(req);
  if (!pathname) return true;
  const route = resolveProtectedRoute(RUNTIMES.EXPRESS, req?.method, pathname);
  if (!route || !authorizeRoute(user?.role, RUNTIMES.EXPRESS, req?.method, pathname)) {
    denyRoutePermission(res);
    return false;
  }
  return true;
}

function requireLegacyTenantBinding(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });

  const configuredTenant = process.env.LEGACY_ANALYTICS_TENANT_ID;
  if (!configuredTenant) {
    return res.status(503).json({ error: 'Fuente legacy sin tenant configurado' });
  }
  if (!req.user.tenantId || String(req.user.tenantId) !== configuredTenant) {
    return res.status(403).json({ error: 'Acceso denegado a la fuente legacy' });
  }
  next();
}

async function resolveAuthoritativeUser(req) {
  const jwtSecret = process.env.JWT_SECRET;
  if (typeof jwtSecret !== 'string' || jwtSecret.length < MIN_JWT_SECRET_LENGTH || !prisma) {
    return { status: 503, error: 'Autenticación no configurada' };
  }

  const authHeader = req?.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { status: 401, error: 'Token requerido' };
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.slice(7), jwtSecret);
  } catch (error) {
    return {
      status: 401,
      error: error.name === 'TokenExpiredError' ? 'Sesión expirada' : 'Token inválido',
    };
  }
  if (typeof decoded?.id !== 'string' || !decoded.id.trim()) {
    return { status: 401, error: 'Token inválido' };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        active: true,
        tenant: {
          select: {
            id: true,
            slug: true,
            name: true,
            shortName: true,
            status: true,
            plan: true,
            themePrimary: true,
            themeAccent: true,
            themeBackground: true,
            logoUrl: true,
            trialEndsAt: true,
          },
        },
      },
    });

    if (!user || !user.active) {
      return { status: 401, error: 'Sesión no vigente' };
    }
    if (!isKnownRole(user.role)) {
      return { status: 403, error: 'Rol no habilitado' };
    }
    if (!user.tenantId && user.role !== 'SUPER_ADMIN') {
      return { status: 403, error: 'Usuario sin municipio habilitado' };
    }
    if (user.tenantId && !evaluateTenantAccess(user.tenant).allowed) {
      return { status: 403, error: 'Municipio no habilitado' };
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        nombre: user.name,
        role: user.role,
        rol: user.role,
        tenantId: user.tenantId,
        tenantSlug: user.tenant?.slug || null,
        tenant: user.tenant,
        authMethod: 'jwt-db',
      },
    };
  } catch (error) {
    console.error('[EXPRESS-AUTHZ] No se pudo consultar el estado actual de la sesión');
    return { status: 503, error: 'No se pudo validar la sesión' };
  }
}

function authoritativeUserForRequest(req) {
  if (!req || (typeof req !== 'object' && typeof req !== 'function')) {
    return Promise.resolve({ status: 401, error: 'Token requerido' });
  }
  const cached = requestAuthCache.get(req);
  if (cached) return cached;
  const pending = resolveAuthoritativeUser(req);
  requestAuthCache.set(req, pending);
  return pending;
}

// ── MIDDLEWARE: JWT identifica; Prisma autoriza ──────────────
async function authenticate(req, res, next) {
  const result = await authoritativeUserForRequest(req);
  if (!result.user) {
    return res.status(result.status).json({ error: result.error });
  }
  if (!enforceCurrentRoutePermission(req, res, result.user)) return;
  req.user = result.user;
  return next();
}

// ── MIDDLEWARE: Requerir rol exacto ─────────────────────────
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

function requireCapability(resource, action) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (!hasResourceAction(req.user.role, resource, action)) {
      return denyRoutePermission(res);
    }
    return next();
  };
}

// ── MIDDLEWARE: Verificar acceso al tenant ───────────────────
function requireTenantAccess(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  // Super admin puede acceder a cualquier tenant
  if (req.user.role === 'SUPER_ADMIN') return next();
  // Otros usuarios solo pueden acceder a su propio tenant
  const tenantId = req.params?.tenantId || req.body?.tenantId;
  if (tenantId && tenantId !== req.user.tenantId) {
    return res.status(403).json({ error: 'Acceso denegado a este tenant' });
  }
  next();
}

// ── SHORTCUTS ────────────────────────────────────────────────
const isSuperAdmin = [authenticate, requireRole('SUPER_ADMIN')];
const isTenantAdmin = [authenticate, requireRole('TENANT_ADMIN')];
const isUser = [authenticate, requireRole('TENANT_USER')];

module.exports = {
  authenticate,
  requireRole,
  requireCapability,
  requireTenantAccess,
  requireLegacyTenantBinding,
  isSuperAdmin,
  isTenantAdmin,
  isUser,
  hasRole,
};
