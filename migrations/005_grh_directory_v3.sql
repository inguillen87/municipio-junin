-- GRH directory v3: source-backed employment facts and governed catalogues.
-- Apply after 004_grh_directory_v2.sql. Existing v2 rows remain explicitly v2
-- until the atomic publisher replaces the tenant with a validated v3 artifact.

ALTER TABLE grh_directory_sources
  DROP CONSTRAINT IF EXISTS grh_directory_sources_schema_version_check,
  DROP CONSTRAINT IF EXISTS grh_directory_sources_v3_content_check;

ALTER TABLE grh_directory_sources
  ADD COLUMN IF NOT EXISTS content_sha256 CHAR(64);

ALTER TABLE grh_directory_sources
  ADD CONSTRAINT grh_directory_sources_schema_version_check
  CHECK (schema_version IN ('grh-directory-v2', 'grh-directory-v3')),
  ADD CONSTRAINT grh_directory_sources_v3_content_check
  CHECK (
    (schema_version = 'grh-directory-v2' AND content_sha256 IS NULL)
    OR
    (schema_version = 'grh-directory-v3' AND content_sha256 ~ '^[0-9a-f]{64}$')
  );

ALTER TABLE grh_directory_dimensions
  DROP CONSTRAINT IF EXISTS grh_directory_dimensions_dimension_check;

ALTER TABLE grh_directory_dimensions
  ADD CONSTRAINT grh_directory_dimensions_dimension_check
  CHECK (dimension IN (
    'sector', 'organization', 'position', 'category', 'agreement', 'costCenter',
    'contractRegime', 'serviceSituation', 'terminationReason'
  ));

ALTER TABLE grh_directory_people
  ADD COLUMN IF NOT EXISTS reported_ingress_date DATE,
  ADD COLUMN IF NOT EXISTS reported_exit_date DATE,
  ADD COLUMN IF NOT EXISTS reported_status TEXT,
  ADD COLUMN IF NOT EXISTS employment_as_of DATE,
  ADD COLUMN IF NOT EXISTS employment_basis TEXT,
  ADD COLUMN IF NOT EXISTS reference_payroll_period CHAR(7),
  ADD COLUMN IF NOT EXISTS reference_payroll_observed BOOLEAN,
  ADD COLUMN IF NOT EXISTS reference_payroll_row_count INTEGER,
  ADD COLUMN IF NOT EXISTS contract_regime_code INTEGER,
  ADD COLUMN IF NOT EXISTS service_situation_code INTEGER,
  ADD COLUMN IF NOT EXISTS termination_reason_code INTEGER,
  ADD COLUMN IF NOT EXISTS content_sha256 CHAR(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'grh_directory_people'::regclass
       AND conname = 'grh_directory_people_reported_status_check'
  ) THEN
    ALTER TABLE grh_directory_people
      ADD CONSTRAINT grh_directory_people_reported_status_check
      CHECK (reported_status IS NULL OR reported_status IN (
        'ended_by_reported_dates',
        'current_by_reported_dates',
        'unknown_missing_ingress',
        'unknown_sentinel_ingress',
        'unknown_implausible_active_tenure',
        'invalid_chronology'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'grh_directory_people'::regclass
       AND conname = 'grh_directory_people_employment_identity_check'
  ) THEN
    ALTER TABLE grh_directory_people
      ADD CONSTRAINT grh_directory_people_employment_identity_check
      CHECK (
        (reported_status IS NULL AND employment_as_of IS NULL AND employment_basis IS NULL
          AND reference_payroll_period IS NULL AND reference_payroll_observed IS NULL
          AND reference_payroll_row_count IS NULL)
        OR
        (reported_status IS NOT NULL AND employment_as_of IS NOT NULL
          AND employment_basis = 'legajo_reported_dates'
          AND reference_payroll_period IS NOT NULL
          AND reference_payroll_observed IS NOT NULL
          AND reference_payroll_row_count IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'grh_directory_people'::regclass
       AND conname = 'grh_directory_people_payroll_identity_check'
  ) THEN
    ALTER TABLE grh_directory_people
      ADD CONSTRAINT grh_directory_people_payroll_identity_check
      CHECK (
        (reference_payroll_period IS NULL AND reference_payroll_observed IS NULL
          AND reference_payroll_row_count IS NULL)
        OR
        (reference_payroll_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
          AND reference_payroll_observed IS NOT NULL
          AND reference_payroll_row_count >= 0
          AND reference_payroll_observed = (reference_payroll_row_count > 0))
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'grh_directory_people'::regclass
       AND conname = 'grh_directory_people_employment_dimension_codes_check'
  ) THEN
    ALTER TABLE grh_directory_people
      ADD CONSTRAINT grh_directory_people_employment_dimension_codes_check
      CHECK (
        (contract_regime_code IS NULL OR contract_regime_code >= 0)
        AND (service_situation_code IS NULL OR service_situation_code >= 0)
        AND (termination_reason_code IS NULL OR termination_reason_code >= 0)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'grh_directory_people'::regclass
       AND conname = 'grh_directory_people_content_sha256_check'
  ) THEN
    ALTER TABLE grh_directory_people
      ADD CONSTRAINT grh_directory_people_content_sha256_check
      CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_grh_directory_people_reported_status
  ON grh_directory_people (tenant_id, reported_status, company_code, legajo)
  WHERE reported_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_grh_directory_people_contract_regime
  ON grh_directory_people (tenant_id, contract_regime_code, company_code, legajo)
  WHERE contract_regime_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_grh_directory_people_service_situation
  ON grh_directory_people (tenant_id, service_situation_code, company_code, legajo)
  WHERE service_situation_code IS NOT NULL;

REVOKE ALL ON TABLE grh_directory_sources FROM PUBLIC;
REVOKE ALL ON TABLE grh_directory_dimensions FROM PUBLIC;
REVOKE ALL ON TABLE grh_directory_people FROM PUBLIC;

COMMENT ON COLUMN grh_directory_sources.content_sha256 IS
  'SHA-256 of the deterministic governed directory content, excluding volatile publication metadata.';
COMMENT ON COLUMN grh_directory_people.reported_status IS
  'Interpretation bounded to ingress/exit dates explicitly reported by legajo; not a contractual truth claim.';
COMMENT ON COLUMN grh_directory_people.reference_payroll_period IS
  'Governed comparison period for calculo participation; not the maximum raw period and not evidence of payment.';
COMMENT ON COLUMN grh_directory_people.content_sha256 IS
  'SHA-256 of the complete governed person record, including bounded histories and employment facts.';
