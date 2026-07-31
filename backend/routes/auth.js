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

const JWT_SECRET  = process.env.JWT_SECRET  || 'govtech-jwt-secret-change-in-production';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

let prisma;
try {
  prisma = require('../lib/prisma');
} catch (e) {
  prisma = null;
}

// ── USUARIOS DEMO (sin DB) ────────────────────────────────────
const DEMO_USERS = [
  {
    id: 'u_sa',
    email: 'superadmin@govtech.ar',
    passwordHash: '$2a$12$demo_hash_superadmin',
    password: 'SuperAdmin2026!',
    name: 'Super Administrador',
    role: 'SUPER_ADMIN',
    tenantId: null,
    tenant: null,
  },
  {
    id: 'u_int',
    email: 'intendente@junin.gob.ar',
    password: 'Junin2026!',
    name: 'Intendente Municipal',
    role: 'TENANT_ADMIN',
    tenantId: 't_junin',
    tenant: { id: 't_junin', slug: 'junin-mendoza', name: 'Municipalidad de Junín', shortName: 'Junín', themePrimary: '#3b82f6', themeAccent: '#6366f1', logoEmoji: '🏛️' },
  },
  {
    id: 'u_hac',
    email: 'hacienda@junin.gob.ar',
    password: 'Hacienda2026!',
    name: 'Director de Hacienda',
    role: 'TENANT_USER',
    tenantId: 't_junin',
    tenant: { id: 't_junin', slug: 'junin-mendoza', name: 'Municipalidad de Junín', shortName: 'Junín', themePrimary: '#3b82f6', themeAccent: '#6366f1', logoEmoji: '🏛️' },
  },
  {
    id: 'u_it',
    email: 'it@junin.gob.ar',
    password: 'IT2026!',
    name: 'Jefe de Tecnología',
    role: 'TENANT_ADMIN',
    tenantId: 't_junin',
    tenant: { id: 't_junin', slug: 'junin-mendoza', name: 'Municipalidad de Junín', shortName: 'Junín', themePrimary: '#3b82f6', themeAccent: '#6366f1', logoEmoji: '🏛️' },
  },
  {
    id: 'u_demo',
    email: 'demo@demo.com',
    password: 'demo123',
    name: 'Usuario Demo',
    role: 'DEMO',
    tenantId: 't_junin',
    tenant: { id: 't_junin', slug: 'junin-mendoza', name: 'Municipalidad de Junín', shortName: 'Junín', themePrimary: '#3b82f6', themeAccent: '#6366f1', logoEmoji: '🏛️' },
  },
];

function signToken(user) {
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
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

  try {
    let user = null;

    if (prisma) {
      // Buscar en DB real
      const dbUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        include: { tenant: { select: { id: true, slug: true, name: true, shortName: true, themePrimary: true, themeAccent: true, logoEmoji: true, status: true, modules: { where: { active: true } } } } },
      });
      if (!dbUser || !dbUser.active) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }
      const valid = await bcrypt.compare(password, dbUser.passwordHash);
      if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });
      // Verificar tenant activo
      if (dbUser.tenant && !['ACTIVE', 'TRIAL'].includes(dbUser.tenant.status)) {
        return res.status(403).json({ error: 'Municipio suspendido. Contactar soporte.' });
      }
      // Actualizar last login
      await prisma.user.update({ where: { id: dbUser.id }, data: { lastLogin: new Date(), loginCount: { increment: 1 } } });
      user = dbUser;
    } else {
      // Modo demo: comparar en texto plano
      user = DEMO_USERS.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
      if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = signToken(user);
    const userData = {
      id:       user.id,
      email:    user.email,
      name:     user.name,
      role:     user.role,
      tenantId: user.tenantId,
      tenant:   user.tenant,
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
  try {
    if (prisma) {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { tenant: { select: { id: true, slug: true, name: true, shortName: true, themePrimary: true, themeAccent: true, logoEmoji: true, modules: { where: { active: true } } } } },
      });
      if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
      return res.json({ ok: true, user: { ...user, passwordHash: undefined } });
    }
    res.json({ ok: true, user: req.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── REFRESH TOKEN ─────────────────────────────────────────────
router.post('/refresh', authenticate, (req, res) => {
  const token = signToken(req.user);
  res.json({ ok: true, token });
});

module.exports = router;
