import { neon } from '@neondatabase/serverless';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

// neon requires tagged template literals, use unsafeUntagged for raw SQL migration
async function runSQL(query) {
  // Use the raw query interface
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(query);
  } finally {
    await pool.end();
  }
}

const statements = [
  "CREATE TABLE IF NOT EXISTS datasets (id SERIAL PRIMARY KEY, module VARCHAR(50) NOT NULL, filename VARCHAR(500), source_type VARCHAR(50), row_count INTEGER DEFAULT 0, period VARCHAR(20), blob_url TEXT, processed BOOLEAN DEFAULT FALSE, uploaded_by VARCHAR(100), created_at TIMESTAMPTZ DEFAULT NOW())",
  "CREATE INDEX IF NOT EXISTS idx_datasets_module ON datasets(module)",
  "CREATE INDEX IF NOT EXISTS idx_datasets_period ON datasets(period)",
  "CREATE TABLE IF NOT EXISTS data_points (id BIGSERIAL PRIMARY KEY, dataset_id INTEGER REFERENCES datasets(id) ON DELETE CASCADE, module VARCHAR(50) NOT NULL, period VARCHAR(20), data JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())",
  "CREATE INDEX IF NOT EXISTS idx_dp_module ON data_points(module)",
  "CREATE INDEX IF NOT EXISTS idx_dp_period ON data_points(period)",
  "CREATE INDEX IF NOT EXISTS idx_dp_dataset ON data_points(dataset_id)",
  "CREATE TABLE IF NOT EXISTS intelligence_reports (id SERIAL PRIMARY KEY, type VARCHAR(100) NOT NULL, period VARCHAR(20), result JSONB, ai_summary TEXT, alert_level VARCHAR(20) DEFAULT 'normal', notified BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())",
  "CREATE INDEX IF NOT EXISTS idx_ir_type ON intelligence_reports(type)",
  "CREATE INDEX IF NOT EXISTS idx_ir_period ON intelligence_reports(period)",
  "CREATE TABLE IF NOT EXISTS data_connections (id SERIAL PRIMARY KEY, module VARCHAR(50), conn_type VARCHAR(50), conn_name VARCHAR(200), config JSONB, schedule VARCHAR(50), last_sync TIMESTAMPTZ, status VARCHAR(20) DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW())",
  "CREATE TABLE IF NOT EXISTS alerts (id SERIAL PRIMARY KEY, type VARCHAR(100), severity VARCHAR(20), message TEXT, module VARCHAR(50), period VARCHAR(20), resolved BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())",
];

let ok = 0, failed = 0;
for (const stmt of statements) {
  try {
    await runSQL(stmt);
    ok++;
    console.log('OK:', stmt.substring(7, 60));
  } catch(e) {
    if (e.message.includes('already exists')) {
      console.log('EXISTS (skip):', stmt.substring(7, 60));
      ok++;
    } else {
      console.error('FAIL:', e.message.substring(0, 120));
      failed++;
    }
  }
}
console.log('\nMigration: ' + ok + ' ok, ' + failed + ' failed');
