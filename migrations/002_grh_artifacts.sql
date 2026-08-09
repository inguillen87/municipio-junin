-- Private, tenant-bound materialization of aggregate-only GRH contracts.
-- Raw GRH records and PII must never be inserted into this table.

CREATE TABLE IF NOT EXISTS grh_artifacts (
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  artifact       TEXT NOT NULL CHECK (artifact IN ('profile', 'semantic')),
  schema_version TEXT,
  snapshot_as_of DATE NOT NULL,
  source_sha256  CHAR(64) NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  payload        JSONB NOT NULL,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, artifact)
);

CREATE INDEX IF NOT EXISTS idx_grh_artifacts_snapshot
  ON grh_artifacts (tenant_id, snapshot_as_of DESC);

REVOKE ALL ON TABLE grh_artifacts FROM PUBLIC;
COMMENT ON TABLE grh_artifacts IS
  'Contratos GRH agregados, sin PII, privados y vinculados al tenant propietario.';
