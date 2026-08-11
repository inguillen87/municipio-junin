-- CreateEnum
CREATE TYPE "GrhActionCommitmentState" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "GrhActionPrioritySeverity" AS ENUM ('CRITICAL', 'WARNING');

-- CreateEnum
CREATE TYPE "GrhActionLedgerCommand" AS ENUM ('CREATE', 'CLAIM', 'BLOCK', 'RESUME', 'COMPLETE', 'RESCHEDULE', 'CANCEL');

-- CreateEnum
CREATE TYPE "GrhActionCode" AS ENUM ('REVIEW_CROSS_SOURCE_RECONCILIATION', 'REVIEW_TEMPORAL_QUARANTINE');

-- CreateTable
CREATE TABLE "grh_action_commitments" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "brief_schema_version" VARCHAR(80) NOT NULL,
    "brief_policy_version" VARCHAR(80) NOT NULL,
    "source_sha256" CHAR(64) NOT NULL,
    "snapshot_as_of" DATE NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "priority_code" VARCHAR(80) NOT NULL,
    "priority_severity" "GrhActionPrioritySeverity" NOT NULL,
    "action_code" "GrhActionCode" NOT NULL,
    "evidence_digest" CHAR(64) NOT NULL,
    "state" "GrhActionCommitmentState" NOT NULL DEFAULT 'OPEN',
    "assignee_role" "Role" NOT NULL,
    "owner_user_id" TEXT,
    "due_on" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "outcome_code" VARCHAR(80),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grh_action_commitments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "grh_action_commitments_contract_check" CHECK (
        btrim("brief_schema_version") <> ''
        AND btrim("brief_policy_version") <> ''
        AND "source_sha256" ~ '^[0-9a-f]{64}$'
        AND "evidence_digest" ~ '^[0-9a-f]{64}$'
        AND "period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
        AND "version" >= 1
        AND "due_on" >= "snapshot_as_of"
    ),
    CONSTRAINT "grh_action_commitments_priority_check" CHECK (
        (
            "priority_code" = 'cross_source_material_difference'
            AND "priority_severity" = 'CRITICAL'
            AND "action_code" = 'REVIEW_CROSS_SOURCE_RECONCILIATION'
        )
        OR (
            "priority_code" = 'temporal_quarantine_present'
            AND "priority_severity" = 'WARNING'
            AND "action_code" = 'REVIEW_TEMPORAL_QUARANTINE'
        )
    ),
    CONSTRAINT "grh_action_commitments_assignee_check" CHECK (
        "assignee_role" IN ('CONTADOR', 'TENANT_ADMIN')
    ),
    CONSTRAINT "grh_action_commitments_state_check" CHECK (
        (
            "state" = 'OPEN'
            AND "owner_user_id" IS NULL
            AND "outcome_code" IS NULL
        )
        OR (
            "state" IN ('IN_PROGRESS', 'BLOCKED')
            AND "owner_user_id" IS NOT NULL
            AND "outcome_code" IS NULL
        )
        OR (
            "state" = 'COMPLETED'
            AND "owner_user_id" IS NOT NULL
            AND "outcome_code" IN ('review_completed', 'correction_requested', 'no_change_required')
        )
        OR (
            "state" = 'CANCELED'
            AND "outcome_code" IS NULL
        )
    )
);

-- CreateTable
CREATE TABLE "grh_action_commitment_events" (
    "sequence" BIGSERIAL NOT NULL,
    "event_id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "commitment_id" UUID NOT NULL,
    "command_id" UUID NOT NULL,
    "payload_digest" CHAR(64) NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "actor_role" "Role" NOT NULL,
    "command" "GrhActionLedgerCommand" NOT NULL,
    "from_state" "GrhActionCommitmentState",
    "to_state" "GrhActionCommitmentState" NOT NULL,
    "reason_code" VARCHAR(80),
    "outcome_code" VARCHAR(80),
    "due_on" DATE,
    "expected_version" INTEGER NOT NULL,
    "result_version" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grh_action_commitment_events_pkey" PRIMARY KEY ("sequence"),
    CONSTRAINT "grh_action_commitment_events_event_id_key" UNIQUE ("event_id"),
    CONSTRAINT "grh_action_commitment_events_payload_check" CHECK (
        "payload_digest" ~ '^[0-9a-f]{64}$'
        AND "actor_role" IN ('INTENDENTE', 'TENANT_ADMIN', 'CONTADOR')
        AND "expected_version" >= 0
        AND "result_version" = "expected_version" + 1
    ),
    CONSTRAINT "grh_action_commitment_events_transition_check" CHECK (
        (
            "command" = 'CREATE'
            AND "from_state" IS NULL
            AND "to_state" = 'OPEN'
            AND "expected_version" = 0
            AND "result_version" = 1
            AND "reason_code" IS NULL
            AND "outcome_code" IS NULL
            AND "due_on" IS NOT NULL
        )
        OR (
            "command" = 'CLAIM'
            AND "from_state" = 'OPEN'
            AND "to_state" = 'IN_PROGRESS'
            AND "reason_code" IS NULL
            AND "outcome_code" IS NULL
            AND "due_on" IS NULL
        )
        OR (
            "command" = 'BLOCK'
            AND "from_state" = 'IN_PROGRESS'
            AND "to_state" = 'BLOCKED'
            AND "reason_code" IN ('dependency_pending', 'source_review_required', 'owner_unavailable')
            AND "outcome_code" IS NULL
            AND "due_on" IS NULL
        )
        OR (
            "command" = 'RESUME'
            AND "from_state" = 'BLOCKED'
            AND "to_state" = 'IN_PROGRESS'
            AND "reason_code" IS NULL
            AND "outcome_code" IS NULL
            AND "due_on" IS NULL
        )
        OR (
            "command" = 'COMPLETE'
            AND "from_state" = 'IN_PROGRESS'
            AND "to_state" = 'COMPLETED'
            AND "reason_code" IS NULL
            AND "outcome_code" IN ('review_completed', 'correction_requested', 'no_change_required')
            AND "due_on" IS NULL
        )
        OR (
            "command" = 'RESCHEDULE'
            AND "from_state" = "to_state"
            AND "to_state" IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')
            AND "reason_code" IS NULL
            AND "outcome_code" IS NULL
            AND "due_on" IS NOT NULL
        )
        OR (
            "command" = 'CANCEL'
            AND "from_state" IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')
            AND "to_state" = 'CANCELED'
            AND "reason_code" IN ('priority_withdrawn', 'duplicate_commitment')
            AND "outcome_code" IS NULL
            AND "due_on" IS NULL
        )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "grh_action_commitments_tenant_id_id_key"
ON "grh_action_commitments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "grh_action_commitments_evidence_priority_key"
ON "grh_action_commitments"(
    "tenant_id",
    "brief_schema_version",
    "brief_policy_version",
    "source_sha256",
    "snapshot_as_of",
    "period",
    "evidence_digest",
    "priority_code"
);

-- CreateIndex
CREATE INDEX "grh_action_commitments_tenant_state_due_idx"
ON "grh_action_commitments"("tenant_id", "state", "due_on");

-- CreateIndex
CREATE INDEX "grh_action_commitments_tenant_assignee_state_idx"
ON "grh_action_commitments"("tenant_id", "assignee_role", "state");

-- CreateIndex
CREATE UNIQUE INDEX "grh_action_commitment_events_tenant_command_key"
ON "grh_action_commitment_events"("tenant_id", "command_id");

-- CreateIndex
CREATE INDEX "grh_action_commitment_events_commitment_sequence_idx"
ON "grh_action_commitment_events"("tenant_id", "commitment_id", "sequence");

-- CreateIndex
CREATE INDEX "grh_action_commitment_events_actor_occurred_idx"
ON "grh_action_commitment_events"("tenant_id", "actor_user_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "grh_action_commitments"
ADD CONSTRAINT "grh_action_commitments_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grh_action_commitments"
ADD CONSTRAINT "grh_action_commitments_created_by_fkey"
FOREIGN KEY ("tenant_id", "created_by_user_id") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grh_action_commitments"
ADD CONSTRAINT "grh_action_commitments_owner_fkey"
FOREIGN KEY ("tenant_id", "owner_user_id") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grh_action_commitment_events"
ADD CONSTRAINT "grh_action_commitment_events_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grh_action_commitment_events"
ADD CONSTRAINT "grh_action_commitment_events_commitment_fkey"
FOREIGN KEY ("tenant_id", "commitment_id") REFERENCES "grh_action_commitments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grh_action_commitment_events"
ADD CONSTRAINT "grh_action_commitment_events_actor_fkey"
FOREIGN KEY ("tenant_id", "actor_user_id") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only ledger protection. Application roles can insert but cannot rewrite history.
CREATE OR REPLACE FUNCTION "grh_action_commitment_events_deny_mutation"()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'grh_action_commitment_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "grh_action_commitment_events_no_update_delete"
BEFORE UPDATE OR DELETE ON "grh_action_commitment_events"
FOR EACH ROW EXECUTE FUNCTION "grh_action_commitment_events_deny_mutation"();

CREATE TRIGGER "grh_action_commitment_events_no_truncate"
BEFORE TRUNCATE ON "grh_action_commitment_events"
FOR EACH STATEMENT EXECUTE FUNCTION "grh_action_commitment_events_deny_mutation"();

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "grh_action_commitment_events" FROM PUBLIC;
