-- Private, tenant-bound GRH employee directory.
-- This schema intentionally excludes documents, tax identifiers, addresses,
-- contacts, bank data, salary and event causes.

CREATE TABLE IF NOT EXISTS grh_directory_sources (
  tenant_id             TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  schema_version        TEXT NOT NULL CHECK (schema_version = 'grh-directory-v1'),
  canonical_system      TEXT NOT NULL,
  source_file           TEXT NOT NULL,
  source_sha256         CHAR(64) NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  snapshot_as_of        DATE NOT NULL,
  artifact_generated_at TIMESTAMPTZ NOT NULL,
  record_count          INTEGER NOT NULL CHECK (record_count >= 0),
  leave_record_count    INTEGER NOT NULL CHECK (leave_record_count >= 0),
  position_observation_count INTEGER NOT NULL CHECK (position_observation_count >= 0),
  published_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grh_directory_dimensions (
  tenant_id    TEXT NOT NULL REFERENCES grh_directory_sources(tenant_id) ON DELETE CASCADE,
  dimension    TEXT NOT NULL CHECK (dimension IN ('sector', 'organization', 'position', 'category', 'agreement')),
  company_code INTEGER NOT NULL CHECK (company_code >= 0),
  scope_code   INTEGER NOT NULL CHECK (scope_code >= 0),
  code         INTEGER NOT NULL CHECK (code >= 0),
  label        TEXT,
  parent_code  INTEGER CHECK (parent_code > 0),
  depends_on_code INTEGER CHECK (depends_on_code > 0),
  PRIMARY KEY (tenant_id, dimension, company_code, scope_code, code),
  CHECK (label IS NULL OR (char_length(label) BETWEEN 1 AND 200)),
  CHECK (dimension = 'category' OR scope_code = 0),
  CHECK (dimension = 'position' OR (parent_code IS NULL AND depends_on_code IS NULL))
);

CREATE TABLE IF NOT EXISTS grh_directory_people (
  tenant_id               TEXT NOT NULL REFERENCES grh_directory_sources(tenant_id) ON DELETE CASCADE,
  company_code            INTEGER NOT NULL CHECK (company_code > 0),
  legajo                   BIGINT NOT NULL CHECK (legajo > 0),
  display_name             TEXT,
  sector_code              INTEGER CHECK (sector_code >= 0),
  organization_code        INTEGER CHECK (organization_code >= 0),
  position_code            INTEGER CHECK (position_code >= 0),
  position_observation_label TEXT,
  position_observed_date     DATE,
  position_observed_period   CHAR(7),
  position_observation_status TEXT,
  position_observation_source TEXT,
  category_code            INTEGER CHECK (category_code >= 0),
  agreement_code           INTEGER CHECK (agreement_code >= 0),
  absence_event_count      INTEGER NOT NULL DEFAULT 0 CHECK (absence_event_count >= 0),
  latest_absence_date      DATE,
  leave_event_count        INTEGER NOT NULL DEFAULT 0 CHECK (leave_event_count >= 0),
  latest_leave_start_date  DATE,
  latest_leave_end_date    DATE,
  PRIMARY KEY (tenant_id, company_code, legajo),
  CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 200),
  CHECK (position_observation_label IS NULL OR char_length(position_observation_label) BETWEEN 1 AND 200),
  CHECK (position_observation_status IS NULL OR position_observation_status IN ('historical_observation', 'source_future_effective')),
  CHECK (position_observation_source IS NULL OR position_observation_source = 'histolegajo'),
  CHECK (position_observed_period IS NULL OR position_observed_period ~ '^[0-9]{4}-[0-9]{2}$'),
  CHECK (
    (position_observation_label IS NULL AND position_observed_date IS NULL AND position_observed_period IS NULL
      AND position_observation_status IS NULL AND position_observation_source IS NULL)
    OR
    (position_observation_label IS NOT NULL AND position_observed_date IS NOT NULL AND position_observed_period IS NOT NULL
      AND position_observation_status IS NOT NULL AND position_observation_source IS NOT NULL)
  ),
  CHECK (latest_leave_end_date IS NULL OR latest_leave_start_date IS NULL OR latest_leave_end_date >= latest_leave_start_date)
);

CREATE TABLE IF NOT EXISTS grh_directory_leave_events (
  tenant_id    TEXT NOT NULL,
  company_code INTEGER NOT NULL,
  legajo       BIGINT NOT NULL,
  event_order  INTEGER NOT NULL CHECK (event_order > 0),
  start_date   DATE NOT NULL,
  end_date     DATE,
  days         INTEGER CHECK (days >= 0),
  PRIMARY KEY (tenant_id, company_code, legajo, event_order),
  FOREIGN KEY (tenant_id, company_code, legajo)
    REFERENCES grh_directory_people(tenant_id, company_code, legajo)
    ON DELETE CASCADE,
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_grh_directory_people_legajo
  ON grh_directory_people (tenant_id, legajo, company_code);

CREATE INDEX IF NOT EXISTS idx_grh_directory_people_name_prefix
  ON grh_directory_people (tenant_id, lower(display_name) text_pattern_ops)
  WHERE display_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_grh_directory_people_sector
  ON grh_directory_people (tenant_id, sector_code, company_code, legajo);

CREATE INDEX IF NOT EXISTS idx_grh_directory_people_organization
  ON grh_directory_people (tenant_id, organization_code, company_code, legajo);

CREATE INDEX IF NOT EXISTS idx_grh_directory_people_position
  ON grh_directory_people (tenant_id, position_code, company_code, legajo);

CREATE INDEX IF NOT EXISTS idx_grh_directory_people_position_observation
  ON grh_directory_people
    (tenant_id, position_observation_label, position_observation_status, company_code, legajo)
  WHERE position_observation_label IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_grh_directory_people_category
  ON grh_directory_people (tenant_id, category_code, company_code, legajo);

CREATE INDEX IF NOT EXISTS idx_grh_directory_people_agreement
  ON grh_directory_people (tenant_id, agreement_code, company_code, legajo);

CREATE INDEX IF NOT EXISTS idx_grh_directory_people_absence
  ON grh_directory_people (tenant_id, latest_absence_date DESC)
  WHERE absence_event_count > 0;

CREATE INDEX IF NOT EXISTS idx_grh_directory_people_leave
  ON grh_directory_people (tenant_id, latest_leave_start_date DESC)
  WHERE leave_event_count > 0;

CREATE INDEX IF NOT EXISTS idx_grh_directory_leave_events_recent
  ON grh_directory_leave_events
    (tenant_id, company_code, legajo, start_date DESC, end_date DESC NULLS LAST, event_order ASC);

REVOKE ALL ON TABLE grh_directory_sources FROM PUBLIC;
REVOKE ALL ON TABLE grh_directory_dimensions FROM PUBLIC;
REVOKE ALL ON TABLE grh_directory_people FROM PUBLIC;
REVOKE ALL ON TABLE grh_directory_leave_events FROM PUBLIC;

COMMENT ON TABLE grh_directory_leave_events IS
  'Private GRH leave history by employee: dates and days only; no cause or notes.';

COMMENT ON TABLE grh_directory_sources IS
  'Proveniencia activa del directorio GRH privado por tenant.';
COMMENT ON TABLE grh_directory_dimensions IS
  'Etiquetas organizativas normalizadas del directorio GRH; no contiene personas.';
COMMENT ON TABLE grh_directory_people IS
  'Directorio GRH privado y mínimo. Contiene nombre y legajo; excluye documentos, contactos, domicilio, salario y causas de eventos.';
