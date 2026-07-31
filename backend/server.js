// ============================================================
// server.js — API REST Principal — Municipalidad de Junín
// Puerto: 3001
// Modo: local con PostgreSQL o demo en memoria
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
const path        = require('path');
const rateLimit   = require('express-rate-limit');
const db          = require('./db/connection');

const app  = express();
// Parse JSON bodies for WhatsApp webhook
app.use('/api/whatsapp', express.json());
const PORT = process.env.PORT || 3001;

// ── CORS ──────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:5500',  // VSCode Live Server
  'https://municipio-junin.vercel.app',
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      cb(null, true);
    } else {
      cb(new Error('CORS bloqueado: ' + origin));
    }
  },
  credentials: true,
}));

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
    version: '1.0.0',
    db:   db.isInMemory() ? 'memory' : 'postgresql',
    mode: process.env.NODE_ENV || 'development',
    ts:   new Date().toISOString(),
  });
});

// ── SERVIR FRONTEND (si se corre todo junto) ───────────
// Cuando el frontend está en la misma carpeta, servirá los archivos estáticos
const frontendPath = path.join(__dirname, '..');
app.use(express.static(frontendPath, { index: 'login.html' }));
app.get('/', (req, res) => res.sendFile(path.join(frontendPath, 'login.html')));

// ── ERROR HANDLER ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Archivo demasiado grande (máx 50MB)' });
  }
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
});

// ── START ───────────────────────────────────────
async function start() {
  await db.connect();
  app.listen(PORT, () => {
    console.log('\n┌────────────────────────────────────────────────────────────');
    console.log('│  🏛️  API Municipalidad de Junín — GovTech v2.0');
    console.log(`│  🌐  http://localhost:${PORT}`);
    console.log(`│  💾  DB: ${db.isInMemory() ? '⚠️  Modo demo (sin PostgreSQL)' : '✅ PostgreSQL conectado'}`);
    console.log('│  📊  Endpoints nuevos:');
    console.log('│     POST /api/whatsapp/webhook    (Meta WhatsApp Bot)');
    console.log('│     GET  /api/whatsapp/webhook    (Verificación Meta)');
    console.log('│     POST /api/whatsapp/send-alert (Alertas proactivas)');
    console.log('│     POST /api/notifications/check (Verificar y enviar)');
    console.log('│     POST /api/notifications/weekly-report');
    console.log('└────────────────────────────────────────────────────────────\n');
  });
}
start();
