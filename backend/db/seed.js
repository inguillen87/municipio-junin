// ============================================================
// db/seed.js — Datos iniciales para desarrollo
// Ejecutar: node db/seed.js
// ============================================================
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  console.log('Sembrando base de datos...');
  try {
    const hash = await bcrypt.hash('demo123', 10);
    const intHash = await bcrypt.hash('junin2026', 10);
    await pool.query(`
      INSERT INTO usuarios (nombre, email, password, rol) VALUES
        ('Administrador Demo', 'demo@demo.com', $1, 'admin'),
        ('Mario Abed', 'intendente@junin.gob.ar', $2, 'intendente'),
        ('Jefe de Tecnología', 'tecnologia@junin.gob.ar', $1, 'admin')
      ON CONFLICT (email) DO NOTHING;
    `, [hash, intHash]);
    console.log('✅ Usuarios creados');

    await pool.query(`
      INSERT INTO proveedores (razon_social, cuit, rubro, riesgo_salida) VALUES
        ('Sistemas Nexo SA', '30-71234567-1', 'Software RRHH', 'Alto'),
        ('GovTech Solutions', '30-68901234-5', 'Expedientes', 'Alto'),
        ('Telecom Argentina', '30-64473710-2', 'Conectividad', 'Bajo'),
        ('Microsoft Argentina', '30-67621671-3', 'Software', 'Medio'),
        ('ControlGas SRL', '30-66543210-7', 'Combustible', 'Alto'),
        ('Sipem Sistemas', '30-65432109-4', 'Tributaria', 'Alto')
      ON CONFLICT (cuit) DO NOTHING;
    `);
    console.log('✅ Proveedores creados');
    console.log('✅ Seed completado exitosamente');
  } catch (err) {
    console.error('❌ Error en seed:', err.message);
  } finally {
    await pool.end();
  }
}
seed();
