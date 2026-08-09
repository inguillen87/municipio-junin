// ============================================================
// db/connection.js — Conexión PostgreSQL fail-closed
// ============================================================
const { Pool } = require('pg');
require('dotenv').config();

let pool = null;
let databaseUnavailable = true;

function validateDatabaseConfiguration(environment = process.env) {
  const connectionString = String(environment.DATABASE_URL || '').trim();
  if (!connectionString) throw new Error('DATABASE_URL_REQUIRED');
  if (environment.NODE_ENV !== 'production') return connectionString;
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL_INVALID');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || parsed.searchParams.get('sslmode') !== 'verify-full') {
    throw new Error('DATABASE_TLS_VERIFY_FULL_REQUIRED');
  }
  return connectionString;
}

async function connect() {
  try {
    const connectionString = validateDatabaseConfiguration();
    pool = new Pool({ connectionString });
    await pool.query('SELECT NOW()');
    databaseUnavailable = false;
    console.log('✅ PostgreSQL conectado');
  } catch (err) {
    console.warn('PostgreSQL no disponible; las rutas de datos quedan no disponibles:', err.message);
    databaseUnavailable = true;
    pool = null;
  }
}

function query(sql, params) {
  if (!pool) throw new Error('DATABASE_NOT_CONNECTED');
  return pool.query(sql, params);
}

function isUnavailable() { return databaseUnavailable; }
function getPool() { return pool; }

module.exports = { connect, query, isUnavailable, getPool, validateDatabaseConfiguration };
