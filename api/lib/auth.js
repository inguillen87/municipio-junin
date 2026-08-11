// api/lib/auth.js - JWT auth middleware
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { assertPrismaDatabaseTransport, prisma } from './db.js';
import accessPolicy from '../../shared/access-policy.cjs';
import corsOriginPolicy from '../../shared/cors-origin-policy.cjs';
import routePolicy from '../../shared/route-policy.cjs';
import tenantLifecycle from '../../shared/tenant-lifecycle.cjs';
import publishedDemoPolicy from '../../shared/published-demo-policy.cjs';

const { hasAnyRole, isKnownRole } = accessPolicy;
const { buildCorsOriginPolicy, isCorsOriginAllowed } = corsOriginPolicy;
const {
  RUNTIMES,
  authorizeRoute,
  hasResourceAction,
  isInternalRouteAllowed,
  resolveProtectedRoute,
} = routePolicy;
const { evaluateTenantAccess } = tenantLifecycle;
const {
  PUBLISHED_DEMO_DECISION_CODES,
  evaluatePublishedDemoRoute,
} = publishedDemoPolicy;

const JWT_SECRET = process.env.JWT_SECRET;
const MIN_JWT_SECRET_LENGTH = 32;
const MIN_INTERNAL_SECRET_LENGTH = 32;
const requestAuthCache = new WeakMap();

export function verifyToken(req) {
  if (!hasValidJwtSecret()) return null;
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    return null;
  }
}

export function hasValidJwtSecret(secret = JWT_SECRET) {
  return typeof secret === 'string' && secret.length >= MIN_JWT_SECRET_LENGTH;
}

function requestRoutePath(req) {
  const pathname = req?.originalUrl || req?.url;
  return typeof pathname === 'string' && pathname.length > 0 ? pathname : null;
}

function denyRoutePermission(res) {
  res.status(403).json({
    error: 'Operacion no habilitada para este perfil',
    code: 'ROUTE_PERMISSION_DENIED',
  });
  return false;
}

function denyPublishedDemoRoute(res) {
  res.status(403).json({
    error: 'La cuenta publicada esta limitada a superficies gobernadas de solo lectura',
    code: PUBLISHED_DEMO_DECISION_CODES.DENIED,
  });
  return false;
}

function enforcePublishedDemoRoute(res, user, routeId) {
  const decision = evaluatePublishedDemoRoute({
    email: user?.email,
    role: user?.role,
    tenantSlug: user?.tenant?.slug,
    routeId,
  });
  return decision.allowed ? true : denyPublishedDemoRoute(res);
}

// Runtime requests always carry a URL. Direct helper/unit invocations without
// routing metadata retain the narrow explicit check for ordinary identities;
// published evaluation identities fail closed because their ceiling is an
// exact route-id allowlist.
function enforceCurrentRoutePermission(req, res, user) {
  const pathname = requestRoutePath(req);
  if (!pathname) return enforcePublishedDemoRoute(res, user, null);
  const route = resolveProtectedRoute(RUNTIMES.SERVERLESS, req?.method, pathname);
  if (!route || !authorizeRoute(user?.role, RUNTIMES.SERVERLESS, req?.method, pathname)) {
    return denyRoutePermission(res);
  }
  return enforcePublishedDemoRoute(res, user, route.id);
}

export async function requireRole(req, res, allowedRoles) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (!hasAnyRole(user.role, allowedRoles)) {
    res.status(403).json({ error: 'Permisos insuficientes' });
    return null;
  }
  return user;
}

export async function requireCapability(req, res, resource, action) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (!hasResourceAction(user.role, resource, action)) {
    denyRoutePermission(res);
    return null;
  }
  return user;
}

export function requireDatasetTenant(res, user, envName) {
  if (!user) return false;
  const configuredTenant = process.env[envName];
  if (!configuredTenant) {
    res.status(503).json({ error: 'Fuente sin tenant configurado' });
    return false;
  }
  if (!user.tenantId || String(user.tenantId) !== configuredTenant) {
    res.status(403).json({ error: 'Acceso denegado a esta fuente' });
    return false;
  }
  return true;
}

export function tenantForRequest(req, res, user) {
  if (!user) return null;
  const requested = String(req.query?.tenantId || req.body?.tenantId || '').trim();
  const ownTenant = String(user.tenantId || '').trim();
  if (user.role === 'SUPER_ADMIN') {
    const tenantId = requested || ownTenant;
    if (!tenantId) {
      res.status(400).json({ error: 'tenantId requerido para esta operación' });
      return null;
    }
    return tenantId;
  }
  if (!ownTenant) {
    res.status(403).json({ error: 'Usuario sin tenant asignado' });
    return null;
  }
  if (requested && requested !== ownTenant) {
    res.status(403).json({ error: 'Acceso denegado a este tenant' });
    return null;
  }
  return ownTenant;
}

export function isTrustedInternalRequest(req, secretName = 'CRON_SECRET') {
  const secret = process.env[secretName];
  const auth = req.headers.authorization;
  if (!hasValidInternalSecret(secret) || !auth || !auth.startsWith('Bearer ')) return false;

  const received = Buffer.from(auth.slice(7));
  const expected = Buffer.from(secret);
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return false;

  const pathname = requestRoutePath(req);
  return !pathname || isInternalRouteAllowed(
    RUNTIMES.SERVERLESS,
    req?.method,
    pathname,
    secretName,
  );
}

function hasValidInternalSecret(secret) {
  return typeof secret === 'string'
    && secret.length >= MIN_INTERNAL_SECRET_LENGTH
    && secret !== JWT_SECRET;
}

export async function requireRoleOrInternal(req, res, allowedRoles, secretName = 'CRON_SECRET') {
  if (isTrustedInternalRequest(req, secretName)) {
    return { id: 'system', role: 'SYSTEM', authMethod: secretName };
  }
  return await requireRole(req, res, allowedRoles);
}

export function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, private, max-age=0');
  res.setHeader('Pragma', 'no-cache');
}

async function resolveAuthoritativeUser(req) {
  if (!hasValidJwtSecret()) {
    return { status: 503, error: 'Autenticación no configurada' };
  }
  const tokenUser = verifyToken(req);
  if (!tokenUser || typeof tokenUser.id !== 'string' || !tokenUser.id.trim()) {
    return { status: 401, error: 'No autorizado' };
  }

  try {
    assertPrismaDatabaseTransport();
    const user = await prisma.user.findUnique({
      where: { id: tokenUser.id },
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
        role: user.role,
        tenantId: user.tenantId,
        tenant: user.tenant,
        authMethod: 'jwt-db',
      },
    };
  } catch (error) {
    console.error('[AUTHZ] No se pudo consultar el estado actual de la sesión');
    return { status: 503, error: 'No se pudo validar la sesión' };
  }
}

function authoritativeUserForRequest(req) {
  if (!req || (typeof req !== 'object' && typeof req !== 'function')) {
    return Promise.resolve({ status: 401, error: 'No autorizado' });
  }
  const cached = requestAuthCache.get(req);
  if (cached) return cached;
  const pending = resolveAuthoritativeUser(req);
  requestAuthCache.set(req, pending);
  return pending;
}

export async function requireAuth(req, res) {
  const result = await authoritativeUserForRequest(req);
  if (!result.user) {
    res.status(result.status).json({ error: result.error });
    return null;
  }
  if (!enforceCurrentRoutePermission(req, res, result.user)) return null;
  return result.user;
}

export function cors(req, res) {
  const policy = buildCorsOriginPolicy(process.env);
  const origin = req.headers.origin;
  if (origin && isCorsOriginAllowed(origin, policy)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-MuniControl-Purpose, X-Correlation-Id',
  );
}
