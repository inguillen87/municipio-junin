// ============================================================
// db/connection.js — Conexión PostgreSQL fail-closed
// ============================================================
const { Pool } = require('pg');
const { inspectDatabaseUrl } = require('../../shared/database-url-policy.cjs');
require('dotenv').config();

let pool = null;
let databaseUnavailable = true;

function validateDatabaseConfiguration(environment = process.env) {
  const connectionString = environment.DATABASE_URL;
  try {
    return inspectDatabaseUrl(connectionString, {
      nodeEnv: environment.NODE_ENV,
      environment,
    }).connectionString;
  } catch (error) {
    if (typeof error?.code === 'string' && error.code) {
      const boundaryError = new Error(error.code);
      boundaryError.code = error.code;
      throw boundaryError;
    }
    throw error;
  }
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
