-- migrations/001_data_intelligence.sql
-- Crear tablas para el sistema de inteligencia de datos
-- Ejecutar en Neon PostgreSQL dashboard o via CLI

-- ── Datasets cargados ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS datasets (
  id          SERIAL PRIMARY KEY,
  module      VARCHAR(50) NOT NULL,        -- rrhh, hacienda, licitaciones, obras, presupuesto, vecinos
  filename    VARCHAR(500),
  source_type VARCHAR(50),                  -- csv, xlsx, pdf, api, gdrive, db
  row_count   INTEGER DEFAULT 0,
  period      VARCHAR(20),                  -- 2026-07
  blob_url    TEXT,                         -- si se sube a Vercel Blob
  processed   BOOLEAN DEFAULT FALSE,
  uploaded_by VARCHAR(100),                 -- email del usuario que subió
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_datasets_module ON datasets(module);
CREATE INDEX IF NOT EXISTS idx_datasets_period ON datasets(period);
CREATE INDEX IF NOT EXISTS idx_datasets_created ON datasets(created_at DESC);

-- ── Datos estructurados por módulo ────────────────────────────
CREATE TABLE IF NOT EXISTS data_points (
  id          BIGSERIAL PRIMARY KEY,
  dataset_id  INTEGER REFERENCES datasets(id) ON DELETE CASCADE,
  module      VARCHAR(50) NOT NULL,
  period      VARCHAR(20),
  data        JSONB NOT NULL,               -- datos reales del archivo
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dp_module ON data_points(module);
CREATE INDEX IF NOT EXISTS idx_dp_period ON data_points(period);
CREATE INDEX IF NOT EXISTS idx_dp_dataset ON data_points(dataset_id);
CREATE INDEX IF NOT EXISTS idx_dp_data ON data_points USING GIN(data);  -- JSONB search

-- ── Reportes de inteligencia cruzada ─────────────────────────
CREATE TABLE IF NOT EXISTS intelligence_reports (
  id          SERIAL PRIMARY KEY,
  type        VARCHAR(100) NOT NULL,        -- salary_vs_budget, obra_efficiency, etc.
  period      VARCHAR(20),
  result      JSONB,                        -- métricas calculadas
  ai_summary  TEXT,                         -- narrativa generada por IA
  alert_level VARCHAR(20) DEFAULT 'normal', -- normal, warning, critical
  notified    BOOLEAN DEFAULT FALSE,        -- si ya se notificó al intendente
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ir_type ON intelligence_reports(type);
CREATE INDEX IF NOT EXISTS idx_ir_period ON intelligence_reports(period);
CREATE INDEX IF NOT EXISTS idx_ir_alert ON intelligence_reports(alert_level);
CREATE INDEX IF NOT EXISTS idx_ir_created ON intelligence_reports(created_at DESC);

-- ── Log de conexiones externas ────────────────────────────────
CREATE TABLE IF NOT EXISTS data_connections (
  id          SERIAL PRIMARY KEY,
  module      VARCHAR(50),
  conn_type   VARCHAR(50),                  -- gdrive, api_rest, postgresql, mysql, sftp
  conn_name   VARCHAR(200),                 -- nombre descriptivo
  config      JSONB,                        -- configuración (sin passwords)
  schedule    VARCHAR(50),                  -- cron expression para sync automático
  last_sync   TIMESTAMPTZ,
  status      VARCHAR(20) DEFAULT 'active',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Auditoría de acceso a datos ───────────────────────────────
CREATE TABLE IF NOT EXISTS data_audit (
  id          BIGSERIAL PRIMARY KEY,
  user_email  VARCHAR(200),
  action      VARCHAR(50),                  -- upload, query, export, delete
  resource    VARCHAR(200),                 -- nombre del dataset o reporte
  module      VARCHAR(50),
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON data_audit(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_created ON data_audit(created_at DESC);

-- ── Alertas automáticas ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id          SERIAL PRIMARY KEY,
  type        VARCHAR(100),                 -- budget_overrun, obra_delay, etc.
  severity    VARCHAR(20),                  -- info, warning, critical
  message     TEXT,
  module      VARCHAR(50),
  period      VARCHAR(20),
  resolved    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Vista para resumen ejecutivo ──────────────────────────────
CREATE OR REPLACE VIEW executive_dashboard AS
SELECT
  d.module,
  d.period,
  COUNT(DISTINCT d.id) AS datasets_count,
  SUM(d.row_count)     AS total_rows,
  MAX(d.created_at)    AS last_upload,
  COUNT(DISTINCT ir.id) AS reports_count,
  MAX(CASE WHEN ir.alert_level = 'critical' THEN 1
           WHEN ir.alert_level = 'warning'  THEN 2
           ELSE 3 END) AS min_alert_priority
FROM datasets d
LEFT JOIN intelligence_reports ir ON ir.period = d.period
GROUP BY d.module, d.period
ORDER BY d.period DESC, d.module;

-- ── Función de auto-alerta ────────────────────────────────────
CREATE OR REPLACE FUNCTION check_budget_alerts()
RETURNS void AS $$
DECLARE
  rec RECORD;
BEGIN
  -- Check for datasets with no data in current period
  FOR rec IN
    SELECT UNNEST(ARRAY['rrhh','hacienda','obras','licitaciones']) AS module
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM datasets
      WHERE module = rec.module
      AND period = TO_CHAR(NOW(), 'YYYY-MM')
    ) THEN
      INSERT INTO alerts (type, severity, message, module, period)
      VALUES (
        'missing_data',
        'warning',
        'No se cargaron datos para ' || rec.module || ' en ' || TO_CHAR(NOW(), 'YYYY-MM'),
        rec.module,
        TO_CHAR(NOW(), 'YYYY-MM')
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Comentarios descriptivos
COMMENT ON TABLE datasets IS 'Registro de archivos cargados al sistema por módulo y período';
COMMENT ON TABLE data_points IS 'Datos estructurados extraídos de cada dataset (CSV, Excel, PDF)';
COMMENT ON TABLE intelligence_reports IS 'Resultados de análisis cruzados entre módulos con narrativa IA';
COMMENT ON TABLE data_connections IS 'Configuración de conexiones externas (Google Drive, APIs, DBs)';
COMMENT ON TABLE data_audit IS 'Registro de auditoría de acceso y modificación de datos';
COMMENT ON TABLE alerts IS 'Alertas automáticas generadas por el motor de inteligencia';
