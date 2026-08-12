-- GRH directory v2: cost-center ownership plus bounded, cause-free histories.
-- Apply after 003_grh_directory.sql. The migration is safe for both a clean
-- database and an existing v1 materialization; publication repopulates the
-- tenant atomically after the schema upgrade.

ALTER TABLE grh_directory_sources
  DROP CONSTRAINT IF EXISTS grh_directory_sources_schema_version_check;

ALTER TABLE grh_directory_sources
  ADD COLUMN IF NOT EXISTS absence_record_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS movement_period_count INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'grh_directory_sources'::regclass
       AND conname = 'grh_directory_sources_absence_record_count_check'
  ) THEN
    ALTER TABLE grh_directory_sources
      ADD CONSTRAINT grh_directory_sources_absence_record_count_check
      CHECK (absence_record_count >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'grh_directory_sources'::regclass
       AND conname = 'grh_directory_sources_movement_period_count_check'
  ) THEN
    ALTER TABLE grh_directory_sources
      ADD CONSTRAINT grh_directory_sources_movement_period_count_check
      CHECK (movement_period_count >= 0);
  END IF;
END $$;

UPDATE grh_directory_sources
   SET schema_version = 'grh-directory-v2'
 WHERE schema_version = 'grh-directory-v1';

ALTER TABLE grh_directory_sources
  ADD CONSTRAINT grh_directory_sources_schema_version_check
  CHECK (schema_version = 'grh-directory-v2');

ALTER TABLE grh_directory_dimensions
  DROP CONSTRAINT IF EXISTS grh_directory_dimensions_dimension_check;

ALTER TABLE grh_directory_dimensions
  ADD CONSTRAINT grh_directory_dimensions_dimension_check
  CHECK (dimension IN ('sector', 'organization', 'position', 'category', 'agreement', 'costCenter'));

ALTER TABLE grh_directory_people
  ADD COLUMN IF NOT EXISTS cost_center_code INTEGER,
  ADD COLUMN IF NOT EXISTS movement_row_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS movement_period_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS latest_movement_period CHAR(7);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'grh_directory_people'::regclass
       AND conname = 'grh_directory_people_cost_center_code_check'
  ) THEN
    ALTER TABLE grh_directory_people
      ADD CONSTRAINT grh_directory_people_cost_center_code_check
      CHECK (cost_center_code >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'grh_directory_people'::regclass
       AND conname = 'grh_directory_people_movement_row_count_check'
  ) THEN
    ALTER TABLE grh_directory_people
      ADD CONSTRAINT grh_directory_people_movement_row_count_check
      CHECK (movement_row_count >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'grh_directory_people'::regclass
       AND conname = 'grh_directory_people_movement_period_count_check'
  ) THEN
    ALTER TABLE grh_directory_people
      ADD CONSTRAINT grh_directory_people_movement_period_count_check
      CHECK (movement_period_count >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'grh_directory_people'::regclass
       AND conname = 'grh_directory_people_latest_movement_period_check'
  ) THEN
    ALTER TABLE grh_directory_people
      ADD CONSTRAINT grh_directory_people_latest_movement_period_check
      CHECK (latest_movement_period IS NULL OR latest_movement_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS grh_directory_absence_events (
  tenant_id    TEXT NOT NULL,
  company_code INTEGER NOT NULL,
  legajo       BIGINT NOT NULL,
  event_order  INTEGER NOT NULL CHECK (event_order > 0),
  event_date   DATE NOT NULL,
  days         INTEGER CHECK (days >= 0),
  PRIMARY KEY (tenant_id, company_code, legajo, event_order),
  FOREIGN KEY (tenant_id, company_code, legajo)
    REFERENCES grh_directory_people(tenant_id, company_code, legajo)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS grh_directory_movement_periods (
  tenant_id    TEXT NOT NULL,
  company_code INTEGER NOT NULL,
  legajo       BIGINT NOT NULL,
  period       CHAR(7) NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  row_count    INTEGER NOT NULL CHECK (row_count > 0),
  PRIMARY KEY (tenant_id, company_code, legajo, period),
  FOREIGN KEY (tenant_id, company_code, legajo)
    REFERENCES grh_directory_people(tenant_id, company_code, legajo)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_grh_directory_people_cost_center
  ON grh_directory_people (tenant_id, cost_center_code, company_code, legajo);

CREATE INDEX IF NOT EXISTS idx_grh_directory_people_movement
  ON grh_directory_people (tenant_id, latest_movement_period DESC, company_code, legajo)
  WHERE movement_row_count > 0;

CREATE INDEX IF NOT EXISTS idx_grh_directory_absence_events_recent
  ON grh_directory_absence_events
    (tenant_id, company_code, legajo, event_date DESC, event_order ASC);

CREATE INDEX IF NOT EXISTS idx_grh_directory_movement_periods_recent
  ON grh_directory_movement_periods
    (tenant_id, company_code, legajo, period DESC);

REVOKE ALL ON TABLE grh_directory_absence_events FROM PUBLIC;
REVOKE ALL ON TABLE grh_directory_movement_periods FROM PUBLIC;

COMMENT ON TABLE grh_directory_absence_events IS
  'Private GRH absence history by employee: date and days only; no cause or notes.';
COMMENT ON TABLE grh_directory_movement_periods IS
  'Private GRH historical movement coverage by employee and period; no amounts or free text.';
COMMENT ON COLUMN grh_directory_people.cost_center_code IS
  'Operational cost-center code from the canonical GRH backup.';
COMMENT ON COLUMN grh_directory_people.latest_movement_period IS
  'Latest verified YYYY-MM period represented in movement history.';
