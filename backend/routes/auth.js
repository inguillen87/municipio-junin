// ============================================================
// auth.js — Autenticación Multi-Tenant
// POST /api/auth/login
// POST /api/auth/me
// POST /api/auth/refresh
// ============================================================

'use strict';

const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const { authenticate } = require('../middleware/authMiddleware');
const {
  ACCESS_POLICY_VERSION,
  getSessionAccessForUser,
  isKnownRole,
} = require('../../shared/access-policy.cjs');
const { evaluateTenantAccess } = require('../../shared/tenant-lifecycle.cjs');
const { inspectLoginCredentials } = require('../../shared/auth-input-policy.cjs');

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';
const MIN_JWT_SECRET_LENGTH = 32;

let prisma;
try {
  prisma = require('../lib/prisma');
} catch (e) {
  prisma = null;
}

function signToken(user) {
  if (typeof JWT_SECRET !== 'string' || JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error('JWT_SECRET no configurado');
  }
  return jwt.sign(
    {
      id:       user.id,
      email:    user.email,
      name:     user.name,
      role:     user.role,
      tenantId: user.tenantId,
      tenantSlug: user.tenant?.slug || null,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

// ── LOGIN ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const credentials = inspectLoginCredentials(req.body);
  if (!credentials.ok) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  const { email, password } = credentials;
  if (typeof JWT_SECRET !== 'string' || JWT_SECRET.length < MIN_JWT_SECRET_LENGTH || !prisma) {
    return res.status(503).json({ error: 'Autenticación no configurada' });
  }

  try {
    let user = null;

    // Buscar en DB real
    const dbUser = await prisma.user.findUnique({
        where: { email },
        include: {
          tenant: {
            select: {
              id: true, slug: true, name: true, shortName: true, status: true, plan: true,
              themePrimary: true, themeAccent: true, themeBackground: true, logoUrl: true, trialEndsAt: true,
            },
          },
        },
      });
      if (!dbUser || !dbUser.active) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }
      const valid = await bcrypt.compare(password, dbUser.passwordHash);
      if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });
      // Verificar identidad y tenant actuales antes de emitir una sesión.
      if (!isKnownRole(dbUser.role)) {
        return res.status(403).json({ error: 'Rol no habilitado.' });
      }
      if (!dbUser.tenantId && dbUser.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Usuario sin municipio habilitado.' });
      }
      if (dbUser.tenantId && !evaluateTenantAccess(dbUser.tenant).allowed) {
        return res.status(403).json({ error: 'Municipio suspendido. Contactar soporte.' });
      }
      const sessionAccess = getSessionAccessForUser(dbUser);
      if (!sessionAccess) {
        return res.status(403).json({ error: 'Perfil de inicio no habilitado.' });
      }
      // Actualizar last login
      await prisma.user.update({ where: { id: dbUser.id }, data: { lastLogin: new Date(), loginCount: { increment: 1 } } });
    user = dbUser;

    const token = signToken(user);
    const userData = {
      id:       user.id,
      email:    user.email,
      name:     user.name,
      role:     user.role,
      tenantId: user.tenantId,
      tenant:   user.tenant,
      capabilities: sessionAccess.capabilities,
      accessPolicyVersion: ACCESS_POLICY_VERSION,
      homeProfile: sessionAccess.homeProfile,
      loginAt:  new Date().toISOString(),
    };

    res.json({ ok: true, token, user: userData });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ── ME (verificar token vigente) ──────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  const sessionAccess = getSessionAccessForUser(req.user);
  if (!sessionAccess) return res.status(403).json({ error: 'Perfil de inicio no habilitado.' });
  return res.json({
    ok: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      tenantId: req.user.tenantId,
      tenant: req.user.tenant,
      capabilities: sessionAccess.capabilities,
      accessPolicyVersion: ACCESS_POLICY_VERSION,
      homeProfile: sessionAccess.homeProfile,
    },
  });
});

// ── REFRESH TOKEN ─────────────────────────────────────────────
// Retired until sessions are persisted and refresh tokens are rotated with
// reuse detection. Re-signing an access token is not a governed refresh flow.
router.post('/refresh', authenticate, (_req, res) => {
  return res.status(410).json({
    error: 'La renovacion de sesion no esta habilitada.',
    code: 'SESSION_REFRESH_NOT_GOVERNED',
  });
});

module.exports = router;
