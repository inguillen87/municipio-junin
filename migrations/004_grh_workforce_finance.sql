-- Standalone, tenant-bound source artifact for the governed workforce-finance
-- projection. This intentionally does not widen grh_artifacts: the active
-- three-part sealed GRH bundle remains an independent release contract.

CREATE TABLE IF NOT EXISTS grh_workforce_finance_artifacts (
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  artifact       TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  snapshot_as_of DATE NOT NULL,
  source_sha256  CHAR(64) NOT NULL,
  payload        JSONB NOT NULL,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, artifact),
  CONSTRAINT grh_workforce_finance_artifact_key_check
    CHECK (artifact = 'workforce_finance'),
  CONSTRAINT grh_workforce_finance_schema_version_check
    CHECK (schema_version = 'grh-workforce-finance-source-v1'),
  CONSTRAINT grh_workforce_finance_source_sha256_check
    CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT grh_workforce_finance_payload_object_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT grh_workforce_finance_payload_schema_identity_check
    CHECK (COALESCE(payload ->> 'schema_version', '') = schema_version),
  CONSTRAINT grh_workforce_finance_payload_source_identity_check
    CHECK (COALESCE(payload #>> '{source,sha256}', '') = BTRIM(source_sha256)),
  CONSTRAINT grh_workforce_finance_payload_snapshot_identity_check
    CHECK (COALESCE(payload #>> '{source,snapshot_as_of}', '') = snapshot_as_of::TEXT)
);

CREATE INDEX IF NOT EXISTS idx_grh_workforce_finance_snapshot
  ON grh_workforce_finance_artifacts (tenant_id, snapshot_as_of DESC)
  WHERE active = TRUE;

REVOKE ALL ON TABLE grh_workforce_finance_artifacts FROM PUBLIC;

COMMENT ON TABLE grh_workforce_finance_artifacts IS
  'Fuente agregada GRH para proyeccion workforce-finance k=10; sin PII y separada del bundle GRH sellado activo.';
