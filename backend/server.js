// ============================================================
// server.js — API REST Principal — Municipalidad de Junín
// Puerto: 3001
// Modo: API independiente; nunca publica el checkout ni uploads.
//
// Inicio rápido:
//   npm install
//   cp .env.example .env
//   npm run dev
// ============================================================
require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const rateLimit   = require('express-rate-limit');
const db          = require('./db/connection');
const { createCorsOptions } = require('./lib/cors-policy');

const app  = express();
// Preserve the exact Meta payload so webhook signatures can be verified.
app.use('/api/whatsapp', express.json({
  limit: '1mb',
  verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer); },
}));
const PORT = process.env.PORT || 3001;

// ── CORS ──────────────────────────────────────────
app.use(cors(createCorsOptions()));

// ── SECURITY & LOGGING ─────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false });
app.use('/api/', limiter);

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Demasiados intentos de login. Espere 15 minutos.' } });
app.use('/api/auth/login', loginLimiter);

// ── RUTAS API ───────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/contratos',     require('./routes/contratos'));
app.use('/api/empleados',     require('./routes/empleados'));
app.use('/api/reclamos',      require('./routes/reclamos'));
app.use('/api/archivos',      require('./routes/archivos'));
app.use('/api/whatsapp',      require('./routes/whatsapp'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/data',          require('./routes/data-connector'));
app.use('/api/admin',         require('./routes/admin'));        // Super Admin — requiere rol SUPER_ADMIN

// ── HEALTH CHECK ──────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    live: true,
    version: '1.0.0',
    db:   db.isUnavailable() ? 'unavailable' : 'postgresql',
    mode: process.env.NODE_ENV || 'development',
    ts:   new Date().toISOString(),
  });
});

app.get('/api/readiness', async (req, res) => {
  if (db.isUnavailable()) {
    return res.status(503).json({
      ok: false,
      ready: false,
      db: 'unavailable',
      error: 'La fuente PostgreSQL no está disponible.',
    });
  }

  try {
    await db.query('SELECT 1');
    return res.status(200).json({
      ok: true,
      ready: true,
      db: 'postgresql',
    });
  } catch {
    return res.status(503).json({
      ok: false,
      ready: false,
      db: 'unavailable',
      error: 'La fuente PostgreSQL no está disponible.',
    });
  }
});

// ── FRONTERA DE PUBLICACIÓN ─────────────────────────────
// Este proceso no publica el checkout, artefactos analíticos ni uploads. El
// frontend tiene un runtime dedicado y toda ruta no API falla cerrada.
app.get('/', (req, res) => res.status(404).json({
  ok: false,
  error: 'Este proceso expone únicamente la API municipal.',
}));

app.use((req, res) => res.status(404).json({
  ok: false,
  error: 'Ruta no disponible.',
}));

// ── ERROR HANDLER ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Archivo demasiado grande (máx 50MB)' });
  }
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── START ───────────────────────────────────────
async function start() {
  await db.connect();
  app.listen(PORT, () => {
    console.log('\n┌────────────────────────────────────────────────────────────');
    console.log('│  🏛️  API Municipalidad de Junín — GovTech v2.0');
    console.log(`│  🌐  http://localhost:${PORT}`);
    console.log(`│  💾  DB: ${db.isUnavailable() ? '⚠️  PostgreSQL no conectado' : '✅ PostgreSQL conectado'}`);
    console.log('│  📊  Endpoints nuevos:');
    console.log('│     POST /api/whatsapp/webhook    (Meta WhatsApp Bot)');
    console.log('│     GET  /api/whatsapp/webhook    (Verificación Meta)');
    console.log('│     POST /api/whatsapp/send-alert (Alertas proactivas)');
    console.log('│     POST /api/notifications/check (Verificar y enviar)');
    console.log('│     POST /api/notifications/weekly-report');
    console.log('└────────────────────────────────────────────────────────────\n');
  });
}
if (require.main === module) {
  start().catch((error) => {
    console.error('[START] No se pudo iniciar la API:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, start };
