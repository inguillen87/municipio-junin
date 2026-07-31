// ============================================================
// db/connection.js — Conexión PostgreSQL con fallback en memoria
// ============================================================
const { Pool } = require('pg');
require('dotenv').config();

let pool = null;
let useInMemory = false;

async function connect() {
  if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
    console.log('⚠️  Sin DATABASE_URL — usando datos en memoria (modo demo)');
    useInMemory = true;
    return;
  }
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL conectado');
  } catch (err) {
    console.warn('⚠️  PostgreSQL no disponible — usando datos en memoria:', err.message);
    useInMemory = true;
    pool = null;
  }
}

function query(sql, params) {
  if (!pool) throw new Error('DATABASE_NOT_CONNECTED');
  return pool.query(sql, params);
}

function isInMemory() { return useInMemory; }
function getPool() { return pool; }

module.exports = { connect, query, isInMemory, getPool };
