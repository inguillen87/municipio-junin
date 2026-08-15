CREATE TABLE IF NOT EXISTS grh_personas_review_runs (
  run_id                    UUID NOT NULL,
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  schema_version            VARCHAR(80) NOT NULL,
  matcher_version           VARCHAR(80) NOT NULL,
  evidence_policy_version   VARCHAR(80) NOT NULL,
  encryption_key_version    VARCHAR(20) NOT NULL,
  snapshot_as_of            DATE NOT NULL,
  grh_source_sha256         CHAR(64) NOT NULL,
  personas_source_sha256    CHAR(64) NOT NULL,
  semantic_digest           CHAR(64) NOT NULL,
  run_digest                CHAR(64) NOT NULL,
  total_case_count          INTEGER NOT NULL,
  total_option_count        INTEGER NOT NULL,
  candidate_case_count      INTEGER NOT NULL,
  ambiguous_case_count      INTEGER NOT NULL,
  unmatched_case_count      INTEGER NOT NULL,
  document_conflict_count   INTEGER NOT NULL,
  auto_approved_count       INTEGER NOT NULL DEFAULT 0,
  status                    VARCHAR(20) NOT NULL,
  created_at                TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at              TIMESTAMPTZ(6),
  PRIMARY KEY (tenant_id, run_id),
  CONSTRAINT grh_personas_review_runs_contract_check CHECK (
    schema_version = 'grh-personas-review-run-v1'
    AND matcher_version = 'grh-personas-linkage-matcher-v1'
    AND evidence_policy_version = 'grh-personas-review-evidence-v2'
    AND encryption_key_version = 'v1'
    AND grh_source_sha256 ~ '^[0-9a-f]{64}$'
    AND personas_source_sha256 ~ '^[0-9a-f]{64}$'
    AND semantic_digest ~ '^[0-9a-f]{64}$'
    AND run_digest ~ '^[0-9a-f]{64}$'
    AND total_case_count >= 0
    AND total_option_count >= 0
    AND candidate_case_count >= 0
    AND ambiguous_case_count >= 0
    AND unmatched_case_count >= 0
    AND candidate_case_count + ambiguous_case_count + unmatched_case_count = total_case_count
    AND document_conflict_count >= 0
    AND document_conflict_count <= total_case_count
    AND auto_approved_count = 0
    AND status IN ('READY', 'RETIRED')
    AND ((status = 'READY' AND published_at IS NOT NULL) OR status = 'RETIRED')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS grh_personas_review_runs_digest_key
  ON grh_personas_review_runs (tenant_id, run_digest);
CREATE UNIQUE INDEX IF NOT EXISTS grh_personas_review_runs_one_ready_key
  ON grh_personas_review_runs (tenant_id) WHERE status = 'READY';

ALTER TABLE grh_personas_review_runs
  DROP CONSTRAINT IF EXISTS grh_personas_review_runs_contract_check;
ALTER TABLE grh_personas_review_runs
  ADD CONSTRAINT grh_personas_review_runs_contract_check CHECK (
    schema_version = 'grh-personas-review-run-v1'
    AND matcher_version = 'grh-personas-linkage-matcher-v1'
    AND evidence_policy_version = 'grh-personas-review-evidence-v2'
    AND encryption_key_version = 'v1'
    AND grh_source_sha256 ~ '^[0-9a-f]{64}$'
    AND personas_source_sha256 ~ '^[0-9a-f]{64}$'
    AND semantic_digest ~ '^[0-9a-f]{64}$'
    AND run_digest ~ '^[0-9a-f]{64}$'
    AND total_case_count >= 0
    AND total_option_count >= 0
    AND candidate_case_count >= 0
    AND ambiguous_case_count >= 0
    AND unmatched_case_count >= 0
    AND candidate_case_count + ambiguous_case_count + unmatched_case_count = total_case_count
    AND document_conflict_count >= 0
    AND document_conflict_count <= total_case_count
    AND auto_approved_count = 0
    AND status IN ('READY', 'RETIRED')
    AND ((status = 'READY' AND published_at IS NOT NULL) OR status = 'RETIRED')
  );

CREATE TABLE IF NOT EXISTS grh_personas_review_cases (
  tenant_id                 TEXT NOT NULL,
  run_id                    UUID NOT NULL,
  case_key                  CHAR(64) NOT NULL,
  grh_ref                   CHAR(64) NOT NULL,
  kind                      VARCHAR(20) NOT NULL,
  status                    VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  priority                  VARCHAR(30) NOT NULL,
  evidence_envelope         JSONB NOT NULL,
  evidence_digest           CHAR(64) NOT NULL,
  document_conflict         BOOLEAN NOT NULL,
  birth_date_conflict       BOOLEAN NOT NULL,
  name_support              BOOLEAN NOT NULL,
  option_count              INTEGER NOT NULL,
  version                   INTEGER NOT NULL DEFAULT 1,
  selected_option_key       CHAR(64),
  selected_personas_ref     CHAR(64),
  reason_code               VARCHAR(80),
  decided_by_user_id        TEXT,
  decided_at                TIMESTAMPTZ(6),
  created_at                TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, run_id, case_key),
  CONSTRAINT grh_personas_review_cases_run_fkey
    FOREIGN KEY (tenant_id, run_id)
    REFERENCES grh_personas_review_runs(tenant_id, run_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT grh_personas_review_cases_decider_fkey
    FOREIGN KEY (decided_by_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT grh_personas_review_cases_contract_check CHECK (
    case_key ~ '^[0-9a-f]{64}$'
    AND grh_ref ~ '^[0-9a-f]{64}$'
    AND evidence_digest ~ '^[0-9a-f]{64}$'
    AND kind IN ('CANDIDATE', 'AMBIGUOUS', 'UNMATCHED')
    AND status IN ('PENDING', 'DEFERRED', 'APPROVED', 'REJECTED')
    AND priority IN ('DOCUMENT_CONFLICT', 'MANUAL_REVIEW', 'STANDARD')
    AND jsonb_typeof(evidence_envelope) = 'object'
    AND evidence_envelope ->> 'schemaVersion' = 'grh-personas-review-envelope-v1'
    AND evidence_envelope ->> 'keyVersion' = 'v1'
    AND evidence_envelope ->> 'algorithm' = 'A256GCM'
    AND option_count >= 0
    AND version >= 1
    AND (kind = 'UNMATCHED') = (option_count = 0)
    AND (priority = 'DOCUMENT_CONFLICT') = document_conflict
    AND (
      (status = 'PENDING' AND selected_option_key IS NULL AND selected_personas_ref IS NULL
        AND reason_code IS NULL AND decided_by_user_id IS NULL AND decided_at IS NULL)
      OR
      (status IN ('DEFERRED', 'REJECTED') AND selected_option_key IS NULL
        AND selected_personas_ref IS NULL AND reason_code IS NOT NULL
        AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
      OR
      (status = 'APPROVED' AND selected_option_key IS NOT NULL
        AND selected_personas_ref IS NOT NULL AND reason_code IS NOT NULL
        AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS grh_personas_review_cases_grh_ref_key
  ON grh_personas_review_cases (tenant_id, run_id, grh_ref);
CREATE INDEX IF NOT EXISTS grh_personas_review_cases_queue_idx
  ON grh_personas_review_cases (tenant_id, run_id, status, kind, case_key);
CREATE UNIQUE INDEX IF NOT EXISTS grh_personas_review_cases_approved_target_key
  ON grh_personas_review_cases (tenant_id, run_id, selected_personas_ref)
  WHERE status = 'APPROVED';

ALTER TABLE grh_personas_review_cases
  DROP CONSTRAINT IF EXISTS grh_personas_review_cases_conflict_approval_check;
ALTER TABLE grh_personas_review_cases
  ADD CONSTRAINT grh_personas_review_cases_conflict_approval_check CHECK (
    status <> 'APPROVED'
    OR (document_conflict = FALSE AND birth_date_conflict = FALSE
      AND priority <> 'DOCUMENT_CONFLICT')
    OR reason_code = 'MANUAL_SOURCE_CHECK_CONFIRMED'
  );

ALTER TABLE grh_personas_review_cases
  DROP CONSTRAINT IF EXISTS grh_personas_review_cases_envelope_check;
ALTER TABLE grh_personas_review_cases
  ADD CONSTRAINT grh_personas_review_cases_envelope_check CHECK (
    jsonb_typeof(evidence_envelope) = 'object'
    AND evidence_envelope ?& ARRAY[
      'schemaVersion', 'keyVersion', 'algorithm', 'iv', 'ciphertext', 'tag'
    ]
    AND (evidence_envelope - ARRAY[
      'schemaVersion', 'keyVersion', 'algorithm', 'iv', 'ciphertext', 'tag'
    ]) = '{}'::jsonb
    AND jsonb_typeof(evidence_envelope -> 'schemaVersion') = 'string'
    AND jsonb_typeof(evidence_envelope -> 'keyVersion') = 'string'
    AND jsonb_typeof(evidence_envelope -> 'algorithm') = 'string'
    AND jsonb_typeof(evidence_envelope -> 'iv') = 'string'
    AND jsonb_typeof(evidence_envelope -> 'ciphertext') = 'string'
    AND jsonb_typeof(evidence_envelope -> 'tag') = 'string'
    AND evidence_envelope ->> 'schemaVersion' = 'grh-personas-review-envelope-v1'
    AND evidence_envelope ->> 'keyVersion' = 'v1'
    AND evidence_envelope ->> 'algorithm' = 'A256GCM'
    AND evidence_envelope ->> 'iv' ~ '^[A-Za-z0-9_-]{16}$'
    AND evidence_envelope ->> 'ciphertext' ~ '^[A-Za-z0-9_-]+$'
    AND length(evidence_envelope ->> 'ciphertext') BETWEEN 2 AND 10923
    AND length(evidence_envelope ->> 'ciphertext') % 4 <> 1
    AND (
      length(evidence_envelope ->> 'ciphertext') % 4 = 0
      OR (length(evidence_envelope ->> 'ciphertext') % 4 = 2
        AND right(evidence_envelope ->> 'ciphertext', 1) ~ '^[AQgw]$')
      OR (length(evidence_envelope ->> 'ciphertext') % 4 = 3
        AND right(evidence_envelope ->> 'ciphertext', 1) ~ '^[AEIMQUYcgkosw048]$')
    )
    AND evidence_envelope ->> 'tag' ~ '^[A-Za-z0-9_-]{21}[AQgw]$'
  );

CREATE TABLE IF NOT EXISTS grh_personas_review_options (
  tenant_id                 TEXT NOT NULL,
  run_id                    UUID NOT NULL,
  case_key                  CHAR(64) NOT NULL,
  option_key                CHAR(64) NOT NULL,
  pair_ref                  CHAR(64) NOT NULL,
  personas_ref              CHAR(64) NOT NULL,
  rank                      INTEGER NOT NULL,
  match_method              VARCHAR(40) NOT NULL,
  evidence_level            VARCHAR(20) NOT NULL,
  evidence_envelope         JSONB NOT NULL,
  evidence_digest           CHAR(64) NOT NULL,
  cuil_evidence             VARCHAR(20) NOT NULL,
  dni_evidence              VARCHAR(20) NOT NULL,
  name_evidence             VARCHAR(20) NOT NULL,
  birth_date_evidence       VARCHAR(20) NOT NULL,
  requires_manual_check     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, run_id, case_key, option_key),
  CONSTRAINT grh_personas_review_options_case_fkey
    FOREIGN KEY (tenant_id, run_id, case_key)
    REFERENCES grh_personas_review_cases(tenant_id, run_id, case_key)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT grh_personas_review_options_contract_check CHECK (
    option_key ~ '^[0-9a-f]{64}$'
    AND pair_ref ~ '^[0-9a-f]{64}$'
    AND personas_ref ~ '^[0-9a-f]{64}$'
    AND evidence_digest ~ '^[0-9a-f]{64}$'
    AND rank >= 1
    AND match_method IN (
      'UNIQUE_VALID_CUIL', 'UNIQUE_DNI_BACKUP', 'DUPLICATE_VALID_CUIL_NAME',
      'DUPLICATE_DNI_NAME', 'DOCUMENT_CANDIDATE', 'NAME_BIRTHDATE_SIGNAL',
      'NAME_ONLY_SIGNAL'
    )
    AND evidence_level IN ('STRONG', 'ASSISTED', 'CONFLICT', 'INSUFFICIENT')
    AND jsonb_typeof(evidence_envelope) = 'object'
    AND evidence_envelope ->> 'schemaVersion' = 'grh-personas-review-envelope-v1'
    AND evidence_envelope ->> 'keyVersion' = 'v1'
    AND evidence_envelope ->> 'algorithm' = 'A256GCM'
    AND cuil_evidence IN ('MATCH', 'CONFLICT', 'MISSING')
    AND dni_evidence IN ('MATCH', 'CONFLICT', 'MISSING')
    AND name_evidence IN ('MATCH', 'DIFFERENT', 'MISSING')
    AND birth_date_evidence IN ('MATCH', 'CONFLICT', 'MISSING')
    AND requires_manual_check = TRUE
  )
);

ALTER TABLE grh_personas_review_options
  DROP CONSTRAINT IF EXISTS grh_personas_review_options_envelope_check;
ALTER TABLE grh_personas_review_options
  ADD CONSTRAINT grh_personas_review_options_envelope_check CHECK (
    jsonb_typeof(evidence_envelope) = 'object'
    AND evidence_envelope ?& ARRAY[
      'schemaVersion', 'keyVersion', 'algorithm', 'iv', 'ciphertext', 'tag'
    ]
    AND (evidence_envelope - ARRAY[
      'schemaVersion', 'keyVersion', 'algorithm', 'iv', 'ciphertext', 'tag'
    ]) = '{}'::jsonb
    AND jsonb_typeof(evidence_envelope -> 'schemaVersion') = 'string'
    AND jsonb_typeof(evidence_envelope -> 'keyVersion') = 'string'
    AND jsonb_typeof(evidence_envelope -> 'algorithm') = 'string'
    AND jsonb_typeof(evidence_envelope -> 'iv') = 'string'
    AND jsonb_typeof(evidence_envelope -> 'ciphertext') = 'string'
    AND jsonb_typeof(evidence_envelope -> 'tag') = 'string'
    AND evidence_envelope ->> 'schemaVersion' = 'grh-personas-review-envelope-v1'
    AND evidence_envelope ->> 'keyVersion' = 'v1'
    AND evidence_envelope ->> 'algorithm' = 'A256GCM'
    AND evidence_envelope ->> 'iv' ~ '^[A-Za-z0-9_-]{16}$'
    AND evidence_envelope ->> 'ciphertext' ~ '^[A-Za-z0-9_-]+$'
    AND length(evidence_envelope ->> 'ciphertext') BETWEEN 2 AND 10923
    AND length(evidence_envelope ->> 'ciphertext') % 4 <> 1
    AND (
      length(evidence_envelope ->> 'ciphertext') % 4 = 0
      OR (length(evidence_envelope ->> 'ciphertext') % 4 = 2
        AND right(evidence_envelope ->> 'ciphertext', 1) ~ '^[AQgw]$')
      OR (length(evidence_envelope ->> 'ciphertext') % 4 = 3
        AND right(evidence_envelope ->> 'ciphertext', 1) ~ '^[AEIMQUYcgkosw048]$')
    )
    AND evidence_envelope ->> 'tag' ~ '^[A-Za-z0-9_-]{21}[AQgw]$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS grh_personas_review_options_pair_ref_key
  ON grh_personas_review_options (tenant_id, run_id, pair_ref);
CREATE UNIQUE INDEX IF NOT EXISTS grh_personas_review_options_personas_per_case_key
  ON grh_personas_review_options (tenant_id, run_id, case_key, personas_ref);
CREATE UNIQUE INDEX IF NOT EXISTS grh_personas_review_options_case_rank_key
  ON grh_personas_review_options (tenant_id, run_id, case_key, rank);
CREATE UNIQUE INDEX IF NOT EXISTS grh_personas_review_options_selection_key
  ON grh_personas_review_options (tenant_id, run_id, case_key, option_key, personas_ref);

CREATE OR REPLACE FUNCTION grh_personas_review_options_validate_conflict_update()
RETURNS TRIGGER AS E'BEGIN
  IF (
    NEW.evidence_level = ''CONFLICT''
    OR (
      (
        NEW.match_method IN (''UNIQUE_DNI_BACKUP'', ''DUPLICATE_DNI_NAME'')
        OR (NEW.dni_evidence = ''MATCH'' AND NEW.cuil_evidence <> ''MATCH'')
      )
      AND NEW.name_evidence <> ''MATCH''
      AND NEW.birth_date_evidence <> ''MATCH''
    )
  ) AND EXISTS (
    SELECT 1
    FROM grh_personas_review_cases
    WHERE tenant_id = NEW.tenant_id
      AND run_id = NEW.run_id
      AND case_key = NEW.case_key
      AND selected_option_key = NEW.option_key
      AND status = ''APPROVED''
      AND reason_code <> ''MANUAL_SOURCE_CHECK_CONFIRMED''
  ) THEN
    RAISE EXCEPTION ''conflict approval requires manual source confirmation''
      USING ERRCODE = ''23514''\073
  END IF\073
  RETURN NEW\073
END\073' LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS grh_personas_review_options_validate_conflict_update
  ON grh_personas_review_options;
CREATE TRIGGER grh_personas_review_options_validate_conflict_update
  BEFORE INSERT OR UPDATE OF evidence_level, match_method, cuil_evidence, dni_evidence,
    name_evidence, birth_date_evidence ON grh_personas_review_options
  FOR EACH ROW EXECUTE FUNCTION grh_personas_review_options_validate_conflict_update();

ALTER TABLE grh_personas_review_cases
  DROP CONSTRAINT IF EXISTS grh_personas_review_cases_selected_option_fkey;
ALTER TABLE grh_personas_review_cases
  ADD CONSTRAINT grh_personas_review_cases_selected_option_fkey
  FOREIGN KEY (tenant_id, run_id, case_key, selected_option_key, selected_personas_ref)
  REFERENCES grh_personas_review_options(tenant_id, run_id, case_key, option_key, personas_ref)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION grh_personas_review_cases_validate_conflict_approval()
RETURNS TRIGGER AS E'DECLARE
  selected_option_requires_manual BOOLEAN\073
BEGIN
  IF NEW.decided_by_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM users
    WHERE id = NEW.decided_by_user_id
      AND "tenantId" = NEW.tenant_id
      AND role IN (''TENANT_ADMIN''::"Role", ''INTENDENTE''::"Role")
      AND active = TRUE
  ) THEN
    RAISE EXCEPTION ''review decider must be an active authorized tenant user''
      USING ERRCODE = ''23514''\073
  END IF\073
  IF NEW.status = ''APPROVED'' AND NEW.reason_code <> ''MANUAL_SOURCE_CHECK_CONFIRMED'' THEN
    IF NEW.document_conflict = TRUE OR NEW.birth_date_conflict = TRUE
        OR NEW.priority = ''DOCUMENT_CONFLICT'' THEN
      RAISE EXCEPTION ''conflict approval requires manual source confirmation''
        USING ERRCODE = ''23514''\073
    END IF\073
    SELECT
      evidence_level = ''CONFLICT''
      OR (
        (
          match_method IN (''UNIQUE_DNI_BACKUP'', ''DUPLICATE_DNI_NAME'')
          OR (dni_evidence = ''MATCH'' AND cuil_evidence <> ''MATCH'')
        )
        AND name_evidence <> ''MATCH''
        AND birth_date_evidence <> ''MATCH''
      )
      INTO selected_option_requires_manual
      FROM grh_personas_review_options
      WHERE tenant_id = NEW.tenant_id
        AND run_id = NEW.run_id
        AND case_key = NEW.case_key
        AND option_key = NEW.selected_option_key\073
    IF selected_option_requires_manual = TRUE THEN
      RAISE EXCEPTION ''conflict approval requires manual source confirmation''
        USING ERRCODE = ''23514''\073
    END IF\073
  END IF\073
  RETURN NEW\073
END\073' LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS grh_personas_review_cases_validate_conflict_approval
  ON grh_personas_review_cases;
CREATE TRIGGER grh_personas_review_cases_validate_conflict_approval
  BEFORE INSERT OR UPDATE OF status, priority, document_conflict, birth_date_conflict,
    selected_option_key, reason_code, decided_by_user_id, tenant_id ON grh_personas_review_cases
  FOR EACH ROW EXECUTE FUNCTION grh_personas_review_cases_validate_conflict_approval();

CREATE TABLE IF NOT EXISTS grh_personas_review_events (
  sequence                   BIGSERIAL PRIMARY KEY,
  event_id                   UUID NOT NULL UNIQUE,
  tenant_id                  TEXT NOT NULL,
  run_id                     UUID NOT NULL,
  case_key                   CHAR(64) NOT NULL,
  command_id                 UUID NOT NULL,
  payload_digest             CHAR(64) NOT NULL,
  actor_user_id              TEXT NOT NULL,
  actor_role                 "Role" NOT NULL,
  command                    VARCHAR(20) NOT NULL,
  from_status                VARCHAR(20) NOT NULL,
  to_status                  VARCHAR(20) NOT NULL,
  selected_option_key        CHAR(64),
  reason_code                VARCHAR(80) NOT NULL,
  purpose                    VARCHAR(40) NOT NULL,
  correlation_id             UUID NOT NULL,
  expected_version           INTEGER NOT NULL,
  result_version             INTEGER NOT NULL,
  occurred_at                TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT grh_personas_review_events_case_fkey
    FOREIGN KEY (tenant_id, run_id, case_key)
    REFERENCES grh_personas_review_cases(tenant_id, run_id, case_key)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT grh_personas_review_events_actor_fkey
    FOREIGN KEY (actor_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT grh_personas_review_events_option_fkey
    FOREIGN KEY (tenant_id, run_id, case_key, selected_option_key)
    REFERENCES grh_personas_review_options(tenant_id, run_id, case_key, option_key)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT grh_personas_review_events_contract_check CHECK (
    case_key ~ '^[0-9a-f]{64}$'
    AND payload_digest ~ '^[0-9a-f]{64}$'
    AND actor_role IN ('TENANT_ADMIN', 'INTENDENTE')
    AND purpose = 'IDENTITY_LINKAGE_REVIEW'
    AND command IN ('APPROVE', 'DEFER', 'REJECT')
    AND from_status IN ('PENDING', 'DEFERRED')
    AND to_status IN ('DEFERRED', 'APPROVED', 'REJECTED')
    AND expected_version >= 1
    AND result_version = expected_version + 1
    AND (
      (command = 'APPROVE' AND to_status = 'APPROVED' AND selected_option_key IS NOT NULL
        AND reason_code IN ('EVIDENCE_CONFIRMED', 'MANUAL_SOURCE_CHECK_CONFIRMED'))
      OR
      (command = 'DEFER' AND to_status = 'DEFERRED' AND selected_option_key IS NULL
        AND reason_code IN ('INSUFFICIENT_EVIDENCE', 'SOURCE_DATA_REVIEW_REQUIRED'))
      OR
      (command = 'REJECT' AND to_status = 'REJECTED' AND selected_option_key IS NULL
        AND reason_code IN ('DIFFERENT_PERSON', 'NO_MATCH_CONFIRMED'))
    )
  )
);

-- Reaplicar este contrato de forma explícita permite endurecer una instalación
-- de ensayo previa sin depender de CREATE TABLE IF NOT EXISTS.
ALTER TABLE grh_personas_review_events
  DROP CONSTRAINT IF EXISTS grh_personas_review_events_contract_check;
ALTER TABLE grh_personas_review_events
  ADD CONSTRAINT grh_personas_review_events_contract_check CHECK (
    case_key ~ '^[0-9a-f]{64}$'
    AND payload_digest ~ '^[0-9a-f]{64}$'
    AND actor_role IN ('TENANT_ADMIN', 'INTENDENTE')
    AND purpose = 'IDENTITY_LINKAGE_REVIEW'
    AND command IN ('APPROVE', 'DEFER', 'REJECT')
    AND from_status IN ('PENDING', 'DEFERRED')
    AND to_status IN ('DEFERRED', 'APPROVED', 'REJECTED')
    AND expected_version >= 1
    AND result_version = expected_version + 1
    AND (
      (command = 'APPROVE' AND to_status = 'APPROVED' AND selected_option_key IS NOT NULL
        AND reason_code IN ('EVIDENCE_CONFIRMED', 'MANUAL_SOURCE_CHECK_CONFIRMED'))
      OR
      (command = 'DEFER' AND to_status = 'DEFERRED' AND selected_option_key IS NULL
        AND reason_code IN ('INSUFFICIENT_EVIDENCE', 'SOURCE_DATA_REVIEW_REQUIRED'))
      OR
      (command = 'REJECT' AND to_status = 'REJECTED' AND selected_option_key IS NULL
        AND reason_code IN ('DIFFERENT_PERSON', 'NO_MATCH_CONFIRMED'))
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS grh_personas_review_events_command_key
  ON grh_personas_review_events (tenant_id, command_id);
CREATE UNIQUE INDEX IF NOT EXISTS grh_personas_review_events_case_version_key
  ON grh_personas_review_events (tenant_id, run_id, case_key, result_version);
CREATE INDEX IF NOT EXISTS grh_personas_review_events_case_sequence_idx
  ON grh_personas_review_events (tenant_id, run_id, case_key, sequence);
CREATE INDEX IF NOT EXISTS grh_personas_review_events_actor_time_idx
  ON grh_personas_review_events (tenant_id, actor_user_id, occurred_at);
CREATE INDEX IF NOT EXISTS grh_personas_review_events_correlation_idx
  ON grh_personas_review_events (tenant_id, correlation_id);

CREATE OR REPLACE FUNCTION grh_personas_review_events_validate_conflict_approval()
RETURNS TRIGGER AS E'DECLARE
  case_document_conflict BOOLEAN\073
  case_birth_date_conflict BOOLEAN\073
  case_priority VARCHAR(30)\073
  selected_option_requires_manual BOOLEAN\073
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users
    WHERE id = NEW.actor_user_id
      AND "tenantId" = NEW.tenant_id
      AND role = NEW.actor_role
      AND role IN (''TENANT_ADMIN''::"Role", ''INTENDENTE''::"Role")
      AND active = TRUE
  ) THEN
    RAISE EXCEPTION ''review actor role must match an active authorized tenant user''
      USING ERRCODE = ''23514''\073
  END IF\073
  IF NEW.command = ''APPROVE'' AND NEW.reason_code <> ''MANUAL_SOURCE_CHECK_CONFIRMED'' THEN
    SELECT cases.document_conflict, cases.birth_date_conflict, cases.priority,
        options.evidence_level = ''CONFLICT''
        OR (
          (
            options.match_method IN (''UNIQUE_DNI_BACKUP'', ''DUPLICATE_DNI_NAME'')
            OR (options.dni_evidence = ''MATCH'' AND options.cuil_evidence <> ''MATCH'')
          )
          AND options.name_evidence <> ''MATCH''
          AND options.birth_date_evidence <> ''MATCH''
        )
      INTO case_document_conflict, case_birth_date_conflict, case_priority,
        selected_option_requires_manual
      FROM grh_personas_review_cases AS cases
      LEFT JOIN grh_personas_review_options AS options
        ON options.tenant_id = cases.tenant_id
        AND options.run_id = cases.run_id
        AND options.case_key = cases.case_key
        AND options.option_key = NEW.selected_option_key
      WHERE cases.tenant_id = NEW.tenant_id
        AND cases.run_id = NEW.run_id
        AND cases.case_key = NEW.case_key\073
    IF case_document_conflict = TRUE OR case_birth_date_conflict = TRUE
        OR case_priority = ''DOCUMENT_CONFLICT'' OR selected_option_requires_manual = TRUE THEN
      RAISE EXCEPTION ''conflict approval requires manual source confirmation''
        USING ERRCODE = ''23514''\073
    END IF\073
  END IF\073
  RETURN NEW\073
END\073' LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS grh_personas_review_events_validate_document_conflict_approval
  ON grh_personas_review_events;
DROP TRIGGER IF EXISTS grh_personas_review_events_validate_conflict_approval
  ON grh_personas_review_events;
CREATE TRIGGER grh_personas_review_events_validate_conflict_approval
  BEFORE INSERT ON grh_personas_review_events
  FOR EACH ROW EXECUTE FUNCTION grh_personas_review_events_validate_conflict_approval();

CREATE OR REPLACE FUNCTION grh_personas_review_events_deny_mutation()
RETURNS TRIGGER AS E'BEGIN
  RAISE EXCEPTION ''grh_personas_review_events is append-only''\073
END\073' LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS grh_personas_review_events_no_update_delete ON grh_personas_review_events;
CREATE TRIGGER grh_personas_review_events_no_update_delete
  BEFORE UPDATE OR DELETE ON grh_personas_review_events
  FOR EACH ROW EXECUTE FUNCTION grh_personas_review_events_deny_mutation();

DROP TRIGGER IF EXISTS grh_personas_review_events_no_truncate ON grh_personas_review_events;
CREATE TRIGGER grh_personas_review_events_no_truncate
  BEFORE TRUNCATE ON grh_personas_review_events
  FOR EACH STATEMENT EXECUTE FUNCTION grh_personas_review_events_deny_mutation();

CREATE OR REPLACE FUNCTION grh_personas_review_runs_guard_immutability()
RETURNS TRIGGER AS E'BEGIN
  IF TG_OP = ''DELETE'' THEN
    RAISE EXCEPTION ''published review runs cannot be deleted''
      USING ERRCODE = ''23514''\073
  END IF\073
  IF OLD.status <> ''READY'' OR NEW.status <> ''RETIRED''
      OR (to_jsonb(NEW) - ''status'') IS DISTINCT FROM (to_jsonb(OLD) - ''status'') THEN
    RAISE EXCEPTION ''published review run provenance is immutable''
      USING ERRCODE = ''23514''\073
  END IF\073
  IF EXISTS (
    SELECT 1 FROM grh_personas_review_cases
    WHERE tenant_id = OLD.tenant_id AND run_id = OLD.run_id
      AND (status <> ''PENDING'' OR version <> 1)
  ) OR EXISTS (
    SELECT 1 FROM grh_personas_review_events
    WHERE tenant_id = OLD.tenant_id AND run_id = OLD.run_id
  ) THEN
    RAISE EXCEPTION ''a review run with decisions cannot be retired''
      USING ERRCODE = ''23514''\073
  END IF\073
  RETURN NEW\073
END\073' LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS grh_personas_review_runs_guard_immutability
  ON grh_personas_review_runs;
CREATE TRIGGER grh_personas_review_runs_guard_immutability
  BEFORE UPDATE OR DELETE ON grh_personas_review_runs
  FOR EACH ROW EXECUTE FUNCTION grh_personas_review_runs_guard_immutability();

CREATE OR REPLACE FUNCTION grh_personas_review_cases_guard_immutability()
RETURNS TRIGGER AS E'DECLARE
  review_run_status VARCHAR(20)\073
  declared_case_capacity INTEGER\073
  observed_case_count INTEGER\073
BEGIN
  IF TG_OP = ''INSERT'' THEN
    SELECT status, total_case_count
      INTO review_run_status, declared_case_capacity
      FROM grh_personas_review_runs
      WHERE tenant_id = NEW.tenant_id AND run_id = NEW.run_id
      FOR UPDATE\073
    IF review_run_status IS DISTINCT FROM ''READY'' THEN
      RAISE EXCEPTION ''new review cases require the ready publication transaction''
        USING ERRCODE = ''23514''\073
    END IF\073
    SELECT COUNT(*)::integer INTO observed_case_count
      FROM grh_personas_review_cases
      WHERE tenant_id = NEW.tenant_id AND run_id = NEW.run_id\073
    IF observed_case_count >= declared_case_capacity THEN
      RAISE EXCEPTION ''review case capacity is already sealed''
        USING ERRCODE = ''23514''\073
    END IF\073
    IF NEW.status <> ''PENDING'' OR NEW.version <> 1
        OR NEW.selected_option_key IS NOT NULL OR NEW.selected_personas_ref IS NOT NULL
        OR NEW.reason_code IS NOT NULL OR NEW.decided_by_user_id IS NOT NULL
        OR NEW.decided_at IS NOT NULL THEN
      RAISE EXCEPTION ''new review cases must start pending without a decision''
        USING ERRCODE = ''23514''\073
    END IF\073
    RETURN NEW\073
  END IF\073
  IF TG_OP = ''DELETE'' THEN
    RAISE EXCEPTION ''published review cases cannot be deleted''
      USING ERRCODE = ''23514''\073
  END IF\073
  IF NOT EXISTS (
    SELECT 1 FROM grh_personas_review_runs
    WHERE tenant_id = OLD.tenant_id AND run_id = OLD.run_id AND status = ''READY''
  ) THEN
    RAISE EXCEPTION ''only cases in the ready review run can be decided''
      USING ERRCODE = ''23514''\073
  END IF\073
  IF (to_jsonb(NEW) - ARRAY[
        ''status'', ''version'', ''selected_option_key'', ''selected_personas_ref'',
        ''reason_code'', ''decided_by_user_id'', ''decided_at'', ''updated_at''
      ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
        ''status'', ''version'', ''selected_option_key'', ''selected_personas_ref'',
        ''reason_code'', ''decided_by_user_id'', ''decided_at'', ''updated_at''
      ]) OR NEW.version <> OLD.version + 1 OR NEW.updated_at IS DISTINCT FROM NEW.decided_at THEN
    RAISE EXCEPTION ''published review case evidence is immutable''
      USING ERRCODE = ''23514''\073
  END IF\073
  RETURN NEW\073
END\073' LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS grh_personas_review_cases_guard_immutability
  ON grh_personas_review_cases;
CREATE TRIGGER grh_personas_review_cases_guard_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON grh_personas_review_cases
  FOR EACH ROW EXECUTE FUNCTION grh_personas_review_cases_guard_immutability();

CREATE OR REPLACE FUNCTION grh_personas_review_options_guard_immutability()
RETURNS TRIGGER AS E'DECLARE
  review_run_status VARCHAR(20)\073
  declared_run_option_capacity INTEGER\073
  declared_case_option_capacity INTEGER\073
  observed_run_option_count INTEGER\073
  observed_case_option_count INTEGER\073
BEGIN
  IF TG_OP = ''INSERT'' THEN
    SELECT status, total_option_count
      INTO review_run_status, declared_run_option_capacity
      FROM grh_personas_review_runs
      WHERE tenant_id = NEW.tenant_id AND run_id = NEW.run_id
      FOR UPDATE\073
    IF review_run_status IS DISTINCT FROM ''READY'' THEN
      RAISE EXCEPTION ''new review options require the ready publication transaction''
        USING ERRCODE = ''23514''\073
    END IF\073
    SELECT option_count INTO declared_case_option_capacity
      FROM grh_personas_review_cases
      WHERE tenant_id = NEW.tenant_id AND run_id = NEW.run_id AND case_key = NEW.case_key
      FOR SHARE\073
    IF declared_case_option_capacity IS NULL THEN
      RAISE EXCEPTION ''review option requires an existing case''
        USING ERRCODE = ''23514''\073
    END IF\073
    SELECT COUNT(*)::integer INTO observed_run_option_count
      FROM grh_personas_review_options
      WHERE tenant_id = NEW.tenant_id AND run_id = NEW.run_id\073
    SELECT COUNT(*)::integer INTO observed_case_option_count
      FROM grh_personas_review_options
      WHERE tenant_id = NEW.tenant_id AND run_id = NEW.run_id AND case_key = NEW.case_key\073
    IF observed_run_option_count >= declared_run_option_capacity
        OR observed_case_option_count >= declared_case_option_capacity THEN
      RAISE EXCEPTION ''review option capacity is already sealed''
        USING ERRCODE = ''23514''\073
    END IF\073
    RETURN NEW\073
  END IF\073
  RAISE EXCEPTION ''published review options are immutable''
    USING ERRCODE = ''23514''\073
END\073' LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS grh_personas_review_options_guard_immutability
  ON grh_personas_review_options;
CREATE TRIGGER grh_personas_review_options_guard_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON grh_personas_review_options
  FOR EACH ROW EXECUTE FUNCTION grh_personas_review_options_guard_immutability();

CREATE OR REPLACE FUNCTION grh_personas_review_deny_publication_truncate()
RETURNS TRIGGER AS E'BEGIN
  RAISE EXCEPTION ''published review data cannot be truncated''
    USING ERRCODE = ''23514''\073
END\073' LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS grh_personas_review_runs_no_truncate ON grh_personas_review_runs;
CREATE TRIGGER grh_personas_review_runs_no_truncate
  BEFORE TRUNCATE ON grh_personas_review_runs
  FOR EACH STATEMENT EXECUTE FUNCTION grh_personas_review_deny_publication_truncate();
DROP TRIGGER IF EXISTS grh_personas_review_cases_no_truncate ON grh_personas_review_cases;
CREATE TRIGGER grh_personas_review_cases_no_truncate
  BEFORE TRUNCATE ON grh_personas_review_cases
  FOR EACH STATEMENT EXECUTE FUNCTION grh_personas_review_deny_publication_truncate();
DROP TRIGGER IF EXISTS grh_personas_review_options_no_truncate ON grh_personas_review_options;
CREATE TRIGGER grh_personas_review_options_no_truncate
  BEFORE TRUNCATE ON grh_personas_review_options
  FOR EACH STATEMENT EXECUTE FUNCTION grh_personas_review_deny_publication_truncate();

CREATE OR REPLACE FUNCTION grh_personas_review_validate_publication_counts()
RETURNS TRIGGER AS E'DECLARE
  expected_cases INTEGER\073
  expected_options INTEGER\073
  expected_candidates INTEGER\073
  expected_ambiguous INTEGER\073
  expected_unmatched INTEGER\073
  expected_document_conflicts INTEGER\073
  observed_cases INTEGER\073
  observed_options INTEGER\073
  non_pending_cases INTEGER\073
  observed_events INTEGER\073
  observed_candidates INTEGER\073
  observed_ambiguous INTEGER\073
  observed_unmatched INTEGER\073
  observed_document_conflicts INTEGER\073
  invalid_case_option_partitions INTEGER\073
BEGIN
  SELECT total_case_count, total_option_count, candidate_case_count,
      ambiguous_case_count, unmatched_case_count, document_conflict_count
    INTO expected_cases, expected_options, expected_candidates,
      expected_ambiguous, expected_unmatched, expected_document_conflicts
    FROM grh_personas_review_runs
    WHERE tenant_id = NEW.tenant_id AND run_id = NEW.run_id AND status = ''READY''\073
  SELECT COUNT(*)::integer INTO observed_cases
    FROM grh_personas_review_cases
    WHERE tenant_id = NEW.tenant_id AND run_id = NEW.run_id\073
  SELECT COUNT(*)::integer INTO observed_options
    FROM grh_personas_review_options
    WHERE tenant_id = NEW.tenant_id AND run_id = NEW.run_id\073
  SELECT COUNT(*)::integer INTO non_pending_cases
    FROM grh_personas_review_cases
    WHERE tenant_id = NEW.tenant_id AND run_id = NEW.run_id
      AND (status <> ''PENDING'' OR version <> 1)\073
  SELECT COUNT(*)::integer INTO observed_events
    FROM grh_personas_review_events
    WHERE tenant_id = NEW.tenant_id AND run_id = NEW.run_id\073
  SELECT
      COUNT(*) FILTER (WHERE kind = ''CANDIDATE'')::integer,
      COUNT(*) FILTER (WHERE kind = ''AMBIGUOUS'')::integer,
      COUNT(*) FILTER (WHERE kind = ''UNMATCHED'')::integer,
      COUNT(*) FILTER (WHERE document_conflict = TRUE)::integer
    INTO observed_candidates, observed_ambiguous, observed_unmatched,
      observed_document_conflicts
    FROM grh_personas_review_cases
    WHERE tenant_id = NEW.tenant_id AND run_id = NEW.run_id\073
  SELECT COUNT(*)::integer INTO invalid_case_option_partitions
    FROM (
      SELECT review_case.case_key, review_case.kind, review_case.option_count,
          COUNT(review_option.option_key)::integer AS observed_option_count
      FROM grh_personas_review_cases AS review_case
      LEFT JOIN grh_personas_review_options AS review_option
        ON review_option.tenant_id = review_case.tenant_id
        AND review_option.run_id = review_case.run_id
        AND review_option.case_key = review_case.case_key
      WHERE review_case.tenant_id = NEW.tenant_id AND review_case.run_id = NEW.run_id
      GROUP BY review_case.case_key, review_case.kind, review_case.option_count
      HAVING COUNT(review_option.option_key) <> review_case.option_count
        OR (review_case.kind = ''CANDIDATE'' AND COUNT(review_option.option_key) <> 1)
        OR (review_case.kind = ''AMBIGUOUS'' AND COUNT(review_option.option_key) < 1)
        OR (review_case.kind = ''UNMATCHED'' AND COUNT(review_option.option_key) <> 0)
    ) AS invalid_partition\073
  IF expected_cases IS NULL OR expected_options IS NULL
      OR observed_cases <> expected_cases OR observed_options <> expected_options
      OR observed_candidates <> expected_candidates
      OR observed_ambiguous <> expected_ambiguous
      OR observed_unmatched <> expected_unmatched
      OR observed_document_conflicts <> expected_document_conflicts
      OR non_pending_cases <> 0 OR observed_events <> 0
      OR invalid_case_option_partitions <> 0 THEN
    RAISE EXCEPTION ''review publication counts do not match the declared run''
      USING ERRCODE = ''23514''\073
  END IF\073
  RETURN NEW\073
END\073' LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS grh_personas_review_runs_validate_counts
  ON grh_personas_review_runs;
DROP TRIGGER IF EXISTS grh_personas_review_cases_validate_counts
  ON grh_personas_review_cases;
DROP TRIGGER IF EXISTS grh_personas_review_options_validate_counts
  ON grh_personas_review_options;
CREATE CONSTRAINT TRIGGER grh_personas_review_runs_validate_counts
  AFTER INSERT ON grh_personas_review_runs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION grh_personas_review_validate_publication_counts();

CREATE OR REPLACE FUNCTION grh_personas_review_cases_require_coherent_event()
RETURNS TRIGGER AS E'DECLARE
  coherent_events INTEGER\073
BEGIN
  IF OLD.status NOT IN (''PENDING'', ''DEFERRED'') THEN
    RAISE EXCEPTION ''terminal review cases cannot transition without an explicit reopen workflow''
      USING ERRCODE = ''23514''\073
  END IF\073
  SELECT COUNT(*)::integer INTO coherent_events
    FROM grh_personas_review_events AS event
    WHERE event.tenant_id = NEW.tenant_id
      AND event.run_id = NEW.run_id
      AND event.case_key = NEW.case_key
      AND event.expected_version = OLD.version
      AND event.result_version = NEW.version
      AND event.from_status = OLD.status
      AND event.to_status = NEW.status
      AND event.selected_option_key IS NOT DISTINCT FROM NEW.selected_option_key
      AND event.reason_code = NEW.reason_code
      AND event.actor_user_id = NEW.decided_by_user_id
      AND event.occurred_at = NEW.decided_at
      AND ((NEW.status = ''APPROVED'' AND event.command = ''APPROVE'')
        OR (NEW.status = ''DEFERRED'' AND event.command = ''DEFER'')
        OR (NEW.status = ''REJECTED'' AND event.command = ''REJECT''))\073
  IF coherent_events <> 1 THEN
    RAISE EXCEPTION ''every review case transition requires exactly one coherent event''
      USING ERRCODE = ''23514''\073
  END IF\073
  RETURN NEW\073
END\073' LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS grh_personas_review_cases_require_coherent_event
  ON grh_personas_review_cases;
CREATE CONSTRAINT TRIGGER grh_personas_review_cases_require_coherent_event
  AFTER UPDATE ON grh_personas_review_cases
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION grh_personas_review_cases_require_coherent_event();

CREATE OR REPLACE FUNCTION grh_personas_review_events_require_coherent_case()
RETURNS TRIGGER AS E'DECLARE
  coherent_cases INTEGER\073
BEGIN
  PERFORM 1 FROM users
    WHERE id = NEW.actor_user_id
      AND "tenantId" = NEW.tenant_id
      AND role = NEW.actor_role
      AND role IN (''TENANT_ADMIN''::"Role", ''INTENDENTE''::"Role")
      AND active = TRUE
    FOR SHARE\073
  IF NOT FOUND THEN
    RAISE EXCEPTION ''review actor changed before the decision committed''
      USING ERRCODE = ''23514''\073
  END IF\073
  IF NOT EXISTS (
    SELECT 1 FROM grh_personas_review_runs
    WHERE tenant_id = NEW.tenant_id AND run_id = NEW.run_id AND status = ''READY''
  ) THEN
    RAISE EXCEPTION ''review events require a ready publication run''
      USING ERRCODE = ''23514''\073
  END IF\073
  SELECT COUNT(*)::integer INTO coherent_cases
    FROM grh_personas_review_cases AS review_case
    WHERE review_case.tenant_id = NEW.tenant_id
      AND review_case.run_id = NEW.run_id
      AND review_case.case_key = NEW.case_key
      AND review_case.version = NEW.result_version
      AND review_case.status = NEW.to_status
      AND review_case.selected_option_key IS NOT DISTINCT FROM NEW.selected_option_key
      AND review_case.reason_code = NEW.reason_code
      AND review_case.decided_by_user_id = NEW.actor_user_id
      AND review_case.decided_at = NEW.occurred_at\073
  IF coherent_cases <> 1 THEN
    RAISE EXCEPTION ''every review event must match the resulting case state''
      USING ERRCODE = ''23514''\073
  END IF\073
  IF NEW.expected_version = 1 THEN
    IF NEW.from_status <> ''PENDING'' THEN
      RAISE EXCEPTION ''the first review event must start from pending''
        USING ERRCODE = ''23514''\073
    END IF\073
  ELSIF NOT EXISTS (
    SELECT 1 FROM grh_personas_review_events AS previous_event
    WHERE previous_event.tenant_id = NEW.tenant_id
      AND previous_event.run_id = NEW.run_id
      AND previous_event.case_key = NEW.case_key
      AND previous_event.result_version = NEW.expected_version
      AND previous_event.to_status = NEW.from_status
  ) THEN
    RAISE EXCEPTION ''review event history must form a continuous version chain''
      USING ERRCODE = ''23514''\073
  END IF\073
  RETURN NEW\073
END\073' LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS grh_personas_review_events_require_coherent_case
  ON grh_personas_review_events;
CREATE CONSTRAINT TRIGGER grh_personas_review_events_require_coherent_case
  AFTER INSERT ON grh_personas_review_events
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION grh_personas_review_events_require_coherent_case();

REVOKE ALL ON TABLE grh_personas_review_runs FROM PUBLIC;
REVOKE ALL ON TABLE grh_personas_review_cases FROM PUBLIC;
REVOKE ALL ON TABLE grh_personas_review_options FROM PUBLIC;
REVOKE ALL ON TABLE grh_personas_review_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE grh_personas_review_events_sequence_seq FROM PUBLIC;

COMMENT ON TABLE grh_personas_review_runs IS 'Versioned source-pinned publication runs for private GRH/PERSONAS review, never an auto-merge.';
COMMENT ON COLUMN grh_personas_review_cases.evidence_envelope IS 'AES-256-GCM envelope containing private GRH evidence. Plaintext PII is forbidden in this table.';
COMMENT ON COLUMN grh_personas_review_options.evidence_envelope IS 'AES-256-GCM envelope containing private PERSONAS evidence. Plaintext PII is forbidden in this table.';
COMMENT ON TABLE grh_personas_review_events IS 'Append-only idempotent human decision history. Nominal detail reads require a separate committed access-audit adapter.';
