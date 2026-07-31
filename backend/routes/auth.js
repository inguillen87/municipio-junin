// ============================================================
// routes/auth.js — Autenticación JWT
// POST /api/auth/login
// GET  /api/auth/me
// POST /api/auth/logout (client-side, JWT stateless)
// ============================================================
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { requireAuth } = require('../middleware/auth');
const db = require('../db/connection');

const router = express.Router();

// Usuarios en memoria (fallback si no hay DB)
const USERS_MOCK = [
  { id: '1', nombre: 'Demo Usuario', email: 'demo@demo.com',              password: '$2b$10$K7L/X6L7bQwS/kYtRwJuYeAHQdj5Q6Jx8fEJGp4lXqO7yGYO9HK9G', rol: 'admin' },
  { id: '2', nombre: 'Mario Abed',   email: 'intendente@junin.gob.ar',   password: '$2b$10$K7L/X6L7bQwS/kYtRwJuYeAHQdj5Q6Jx8fEJGp4lXqO7yGYO9HK9G', rol: 'intendente' },
  { id: '3', nombre: 'Jefe IT',      email: 'tecnologia@junin.gob.ar',   password: '$2b$10$K7L/X6L7bQwS/kYtRwJuYeAHQdj5Q6Jx8fEJGp4lXqO7yGYO9HK9G', rol: 'admin' },
];
// Contraseñas demo: demo123, junin2026
const DEMO_PASSWORDS = {
  'demo@demo.com':            'demo123',
  'intendente@junin.gob.ar': 'junin2026',
  'tecnologia@junin.gob.ar': 'tech2026',
};

const JWT_SECRET = process.env.JWT_SECRET || 'municipio_junin_dev_secret_32chars';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }
  try {
    let user = null;
    if (db.isInMemory()) {
      // Modo demo: verificar contra contraseñas hardcodeadas
      const demoPass = DEMO_PASSWORDS[email.toLowerCase()];
      if (demoPass && password === demoPass) {
        user = USERS_MOCK.find(u => u.email === email.toLowerCase());
      }
    } else {
      const result = await db.query('SELECT * FROM usuarios WHERE email = $1 AND activo = true', [email.toLowerCase()]);
      if (result.rows.length > 0) {
        const dbUser = result.rows[0];
        const valid  = await bcrypt.compare(password, dbUser.password);
        if (valid) user = dbUser;
      }
    }
    if (!user) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    // Log de acceso
    if (!db.isInMemory()) {
      db.query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1', [user.id]).catch(() => {});
    }
    res.json({
      ok: true,
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
