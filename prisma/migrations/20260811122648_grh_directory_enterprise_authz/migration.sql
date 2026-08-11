-- CreateEnum
CREATE TYPE "AccountLifecycleStatus" AS ENUM ('INVITED', 'FIRST_LOGIN_REQUIRED', 'ACTIVE', 'SUSPENDED', 'LOCKED', 'EXPIRED', 'REVOKED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "OrgUnitKind" AS ENUM ('MUNICIPALITY', 'SECRETARIAT', 'DIRECTORATE', 'DEPARTMENT', 'OFFICE', 'PROGRAM', 'PROJECT', 'TERRITORIAL_ZONE');

-- CreateEnum
CREATE TYPE "OrgUnitStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PolicyBundleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RoleDefinitionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "ScopeKind" AS ENUM ('PLATFORM', 'TENANT', 'ORG_UNIT', 'ORG_SUBTREE', 'SELF', 'ASSIGNED_RESOURCE', 'RESOURCE', 'DATASET', 'GEOGRAPHIC_BOUNDARY');

-- CreateEnum
CREATE TYPE "ScopeStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "RoleAssignmentStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('BOOTSTRAP', 'INVITATION', 'ADMIN_REQUEST', 'ACCESS_REVIEW', 'IDENTITY_PROVIDER', 'MIGRATION');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('ALLOWED', 'DENIED', 'FAILED', 'SUCCEEDED', 'PENDING');

-- Tenant-safe references to existing users require an addressable compound key.
CREATE UNIQUE INDEX "users_tenantId_id_key" ON "users"("tenantId", "id");

-- CreateTable
CREATE TABLE "auth_user_security_states" (
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "lifecycle_status" "AccountLifecycleStatus" NOT NULL DEFAULT 'INVITED',
    "token_version" INTEGER NOT NULL DEFAULT 1,
    "authorization_version" INTEGER NOT NULL DEFAULT 1,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "mfa_required" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "account_expires_at" TIMESTAMPTZ(6),
    "activation_completed_at" TIMESTAMPTZ(6),
    "password_changed_at" TIMESTAMPTZ(6),
    "suspended_at" TIMESTAMPTZ(6),
    "suspended_by_user_id" TEXT,
    "suspension_reason_code" VARCHAR(80),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_user_security_states_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "auth_user_security_states_versions_check" CHECK (
        "token_version" >= 1
        AND "authorization_version" >= 1
        AND "failed_login_count" >= 0
    ),
    CONSTRAINT "auth_user_security_states_lifecycle_check" CHECK (
        ("lifecycle_status" <> 'SUSPENDED' OR "suspended_at" IS NOT NULL)
        AND ("lifecycle_status" NOT IN ('REVOKED', 'TERMINATED') OR "revoked_at" IS NOT NULL)
        AND ("suspension_reason_code" IS NULL OR btrim("suspension_reason_code") <> '')
    ),
    CONSTRAINT "auth_user_security_states_expiry_check" CHECK (
        "account_expires_at" IS NULL OR "account_expires_at" > "created_at"
    )
);

-- CreateTable
CREATE TABLE "auth_org_units" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "kind" "OrgUnitKind" NOT NULL,
    "status" "OrgUnitStatus" NOT NULL DEFAULT 'ACTIVE',
    "parent_id" TEXT,
    "hierarchy_path" VARCHAR(1200) NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6),
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_org_units_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_org_units_identity_check" CHECK (
        btrim("code") <> ''
        AND btrim("name") <> ''
        AND btrim("hierarchy_path") <> ''
        AND ("parent_id" IS NULL OR "parent_id" <> "id")
    ),
    CONSTRAINT "auth_org_units_validity_check" CHECK (
        "valid_until" IS NULL OR "valid_until" > "valid_from"
    )
);

-- CreateTable
CREATE TABLE "auth_org_unit_closure" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ancestor_id" TEXT NOT NULL,
    "descendant_id" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,

    CONSTRAINT "auth_org_unit_closure_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_org_unit_closure_depth_check" CHECK (
        ("depth" = 0 AND "ancestor_id" = "descendant_id")
        OR ("depth" > 0 AND "ancestor_id" <> "descendant_id")
    )
);

-- CreateTable
CREATE TABLE "auth_policy_bundles" (
    "id" TEXT NOT NULL,
    "namespace" VARCHAR(120) NOT NULL,
    "tenant_id" TEXT,
    "version" VARCHAR(80) NOT NULL,
    "status" "PolicyBundleStatus" NOT NULL DEFAULT 'DRAFT',
    "schema_version" VARCHAR(40) NOT NULL,
    "route_policy_version" VARCHAR(80) NOT NULL,
    "policy_digest" CHAR(64) NOT NULL,
    "description" TEXT,
    "created_by_user_id" TEXT,
    "approved_request_id" TEXT,
    "activated_at" TIMESTAMPTZ(6),
    "retired_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_policy_bundles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_policy_bundles_identity_check" CHECK (
        btrim("namespace") <> ''
        AND btrim("version") <> ''
        AND btrim("schema_version") <> ''
        AND btrim("route_policy_version") <> ''
    ),
    CONSTRAINT "auth_policy_bundles_digest_check" CHECK (
        "policy_digest" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "auth_policy_bundles_status_check" CHECK (
        ("status" IN ('DRAFT', 'REJECTED') AND "activated_at" IS NULL AND "retired_at" IS NULL)
        OR ("status" = 'ACTIVE' AND "activated_at" IS NOT NULL AND "retired_at" IS NULL)
        OR (
            "status" = 'RETIRED'
            AND "activated_at" IS NOT NULL
            AND "retired_at" IS NOT NULL
            AND "retired_at" >= "activated_at"
        )
    )
);

-- CreateTable
CREATE TABLE "auth_capabilities" (
    "key" VARCHAR(160) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "description" TEXT NOT NULL,
    "data_classification" VARCHAR(40) NOT NULL,
    "privileged" BOOLEAN NOT NULL DEFAULT false,
    "requires_mfa" BOOLEAN NOT NULL DEFAULT false,
    "requires_reauth" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_capabilities_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "auth_capabilities_exact_key_check" CHECK (
        "resource_type" ~ '^[a-z][a-z0-9_.-]*$'
        AND "action" ~ '^[a-z][a-z0-9_.-]*$'
        AND "key" = "resource_type" || ':' || "action"
    ),
    CONSTRAINT "auth_capabilities_metadata_check" CHECK (
        btrim("description") <> '' AND btrim("data_classification") <> ''
    )
);

-- CreateTable
CREATE TABLE "auth_role_definitions" (
    "id" TEXT NOT NULL,
    "namespace" VARCHAR(120) NOT NULL,
    "tenant_id" TEXT,
    "role_key" VARCHAR(100) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "display_name" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "RoleDefinitionStatus" NOT NULL DEFAULT 'DRAFT',
    "privileged" BOOLEAN NOT NULL DEFAULT false,
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "policy_bundle_id" TEXT NOT NULL,
    "valid_from" TIMESTAMPTZ(6),
    "valid_until" TIMESTAMPTZ(6),
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_role_definitions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_role_definitions_identity_check" CHECK (
        "version" >= 1
        AND btrim("namespace") <> ''
        AND "role_key" ~ '^[a-z][a-z0-9_.-]*$'
        AND btrim("display_name") <> ''
        AND btrim("description") <> ''
    ),
    CONSTRAINT "auth_role_definitions_validity_check" CHECK (
        "valid_from" IS NULL OR "valid_until" IS NULL OR "valid_until" > "valid_from"
    )
);

-- CreateTable
CREATE TABLE "auth_role_capabilities" (
    "id" TEXT NOT NULL,
    "role_definition_id" TEXT NOT NULL,
    "capability_key" VARCHAR(160) NOT NULL,
    "effect" "PermissionEffect" NOT NULL DEFAULT 'ALLOW',
    "constraint_schema_version" VARCHAR(40),
    "constraints" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_role_capabilities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_role_capabilities_constraints_check" CHECK (
        ("constraint_schema_version" IS NULL AND "constraints" IS NULL)
        OR (
            "constraint_schema_version" IS NOT NULL
            AND btrim("constraint_schema_version") <> ''
            AND "constraints" IS NOT NULL
            AND jsonb_typeof("constraints") = 'object'
        )
    )
);

-- CreateTable
CREATE TABLE "auth_scopes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "kind" "ScopeKind" NOT NULL,
    "status" "ScopeStatus" NOT NULL DEFAULT 'ACTIVE',
    "org_unit_id" TEXT,
    "resource_type" VARCHAR(100),
    "resource_id" VARCHAR(200),
    "dataset_key" VARCHAR(160),
    "geographic_boundary_id" VARCHAR(200),
    "constraint_schema_version" VARCHAR(40),
    "constraints" JSONB,
    "normalized_digest" CHAR(64) NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retired_at" TIMESTAMPTZ(6),

    CONSTRAINT "auth_scopes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_scopes_digest_check" CHECK (
        "normalized_digest" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "auth_scopes_constraints_check" CHECK (
        ("constraint_schema_version" IS NULL AND "constraints" IS NULL)
        OR (
            "constraint_schema_version" IS NOT NULL
            AND btrim("constraint_schema_version") <> ''
            AND "constraints" IS NOT NULL
            AND jsonb_typeof("constraints") = 'object'
        )
    ),
    CONSTRAINT "auth_scopes_status_check" CHECK (
        ("status" = 'ACTIVE' AND "retired_at" IS NULL)
        OR ("status" = 'RETIRED' AND "retired_at" IS NOT NULL)
    ),
    CONSTRAINT "auth_scopes_kind_check" CHECK (
        (
            "kind" = 'PLATFORM'
            AND "tenant_id" IS NULL
            AND "org_unit_id" IS NULL
            AND "resource_type" IS NULL
            AND "resource_id" IS NULL
            AND "dataset_key" IS NULL
            AND "geographic_boundary_id" IS NULL
        )
        OR (
            "kind" IN ('TENANT', 'SELF')
            AND "tenant_id" IS NOT NULL
            AND "org_unit_id" IS NULL
            AND "resource_type" IS NULL
            AND "resource_id" IS NULL
            AND "dataset_key" IS NULL
            AND "geographic_boundary_id" IS NULL
        )
        OR (
            "kind" IN ('ORG_UNIT', 'ORG_SUBTREE')
            AND "tenant_id" IS NOT NULL
            AND "org_unit_id" IS NOT NULL
            AND "resource_type" IS NULL
            AND "resource_id" IS NULL
            AND "dataset_key" IS NULL
            AND "geographic_boundary_id" IS NULL
        )
        OR (
            "kind" = 'ASSIGNED_RESOURCE'
            AND "tenant_id" IS NOT NULL
            AND "org_unit_id" IS NULL
            AND "resource_type" IS NOT NULL
            AND btrim("resource_type") <> ''
            AND "resource_id" IS NULL
            AND "dataset_key" IS NULL
            AND "geographic_boundary_id" IS NULL
        )
        OR (
            "kind" = 'RESOURCE'
            AND "tenant_id" IS NOT NULL
            AND "org_unit_id" IS NULL
            AND "resource_type" IS NOT NULL
            AND btrim("resource_type") <> ''
            AND "resource_id" IS NOT NULL
            AND btrim("resource_id") <> ''
            AND "dataset_key" IS NULL
            AND "geographic_boundary_id" IS NULL
        )
        OR (
            "kind" = 'DATASET'
            AND "tenant_id" IS NOT NULL
            AND "org_unit_id" IS NULL
            AND "resource_type" IS NULL
            AND "resource_id" IS NULL
            AND "dataset_key" IS NOT NULL
            AND btrim("dataset_key") <> ''
            AND "geographic_boundary_id" IS NULL
        )
        OR (
            "kind" = 'GEOGRAPHIC_BOUNDARY'
            AND "tenant_id" IS NOT NULL
            AND "org_unit_id" IS NULL
            AND "resource_type" IS NULL
            AND "resource_id" IS NULL
            AND "dataset_key" IS NULL
            AND "geographic_boundary_id" IS NOT NULL
            AND btrim("geographic_boundary_id") <> ''
        )
    )
);

-- CreateTable
CREATE TABLE "auth_role_assignments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "subject_user_id" TEXT NOT NULL,
    "role_definition_id" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "status" "RoleAssignmentStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "source" "AssignmentSource" NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6),
    "reason_code" VARCHAR(80) NOT NULL,
    "reason_detail" TEXT,
    "requested_by_user_id" TEXT NOT NULL,
    "approval_request_id" TEXT,
    "activated_at" TIMESTAMPTZ(6),
    "suspended_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_user_id" TEXT,
    "supersedes_assignment_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_role_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_role_assignments_validity_check" CHECK (
        ("valid_until" IS NULL OR "valid_until" > "valid_from")
        AND btrim("reason_code") <> ''
        AND ("supersedes_assignment_id" IS NULL OR "supersedes_assignment_id" <> "id")
    ),
    CONSTRAINT "auth_role_assignments_status_check" CHECK (
        (
            "status" IN ('PENDING_APPROVAL', 'REJECTED')
            AND "activated_at" IS NULL
            AND "suspended_at" IS NULL
            AND "revoked_at" IS NULL
        )
        OR (
            "status" = 'ACTIVE'
            AND "activated_at" IS NOT NULL
            AND "suspended_at" IS NULL
            AND "revoked_at" IS NULL
        )
        OR (
            "status" = 'SUSPENDED'
            AND "activated_at" IS NOT NULL
            AND "suspended_at" IS NOT NULL
            AND "revoked_at" IS NULL
        )
        OR (
            "status" = 'EXPIRED'
            AND "activated_at" IS NOT NULL
            AND "valid_until" IS NOT NULL
            AND "revoked_at" IS NULL
        )
        OR ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "security_audit_events" (
    "sequence" BIGSERIAL NOT NULL,
    "event_id" UUID NOT NULL,
    "chain_partition" VARCHAR(160) NOT NULL,
    "chain_sequence" BIGINT NOT NULL,
    "previous_hash" CHAR(64) NOT NULL,
    "event_hash" CHAR(64) NOT NULL,
    "schema_version" VARCHAR(40) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "principal_hash" CHAR(64) NOT NULL,
    "permission" VARCHAR(160) NOT NULL,
    "purpose" VARCHAR(32) NOT NULL,
    "operation" VARCHAR(16) NOT NULL,
    "outcome" "AuditOutcome" NOT NULL,
    "authorization_mode" VARCHAR(16) NOT NULL,
    "authorization_reason" VARCHAR(64) NOT NULL,
    "policy_version" VARCHAR(128),
    "assignment_ids" TEXT[] NOT NULL,
    "scope_ids" TEXT[] NOT NULL,
    "scope_kind" VARCHAR(20) NOT NULL,
    "organization_count" INTEGER NOT NULL,
    "result_count" INTEGER NOT NULL,
    "correlation_id" VARCHAR(128) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_audit_events_pkey" PRIMARY KEY ("sequence"),
    CONSTRAINT "security_audit_events_contract_check" CHECK (
        "schema_version" = 'security-audit-event-v1'
        AND "permission" = 'grh.directory:read'
        AND "purpose" IN ('DIRECTORY_BROWSE', 'PERSON_LOOKUP', 'LEAVE_REVIEW')
        AND "operation" IN ('list', 'detail')
        AND "outcome" IN ('ALLOWED', 'DENIED')
        AND "authorization_mode" IN ('disabled', 'shadow', 'intersect')
        AND "authorization_reason" ~ '^[A-Z][A-Z0-9_]{0,63}$'
        AND "scope_kind" IN ('NONE', 'TENANT', 'ORG_UNIT', 'ORG_SUBTREE', 'MIXED')
        AND "tenant_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
        AND "correlation_id" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{7,127}$'
        AND (
            "policy_version" IS NULL
            OR "policy_version" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
        )
    ),
    CONSTRAINT "security_audit_events_digest_check" CHECK (
        "event_hash" ~ '^[0-9a-f]{64}$'
        AND "previous_hash" ~ '^[0-9a-f]{64}$'
        AND "principal_hash" ~ '^[0-9a-f]{64}$'
        AND "previous_hash" <> "event_hash"
    ),
    CONSTRAINT "security_audit_events_chain_check" CHECK (
        "chain_sequence" >= 1
        AND "chain_partition" = (
            'grh-directory/' || "tenant_id" || '/' || to_char("occurred_at" AT TIME ZONE 'UTC', 'YYYY-MM')
        )
    ),
    CONSTRAINT "security_audit_events_arrays_check" CHECK (
        cardinality("assignment_ids") <= 64
        AND cardinality("scope_ids") <= 64
        AND array_position("assignment_ids", NULL) IS NULL
        AND array_position("scope_ids", NULL) IS NULL
        AND (
            cardinality("assignment_ids") = 0
            OR array_to_string("assignment_ids", ',') ~ '^(?:[A-Za-z0-9][A-Za-z0-9._:/-]{0,127})(?:,[A-Za-z0-9][A-Za-z0-9._:/-]{0,127})*$'
        )
        AND (
            cardinality("scope_ids") = 0
            OR array_to_string("scope_ids", ',') ~ '^(?:[A-Za-z0-9][A-Za-z0-9._:/-]{0,127})(?:,[A-Za-z0-9][A-Za-z0-9._:/-]{0,127})*$'
        )
        AND (cardinality("assignment_ids") = 0 OR "policy_version" IS NOT NULL)
    ),
    CONSTRAINT "security_audit_events_result_check" CHECK (
        "organization_count" BETWEEN 0 AND 1000000
        AND "result_count" BETWEEN 0 AND 1000000
        AND (
            ("scope_kind" IN ('NONE', 'TENANT') AND "organization_count" = 0)
            OR ("scope_kind" IN ('ORG_UNIT', 'ORG_SUBTREE', 'MIXED') AND "organization_count" > 0)
        )
        AND ("scope_kind" <> 'NONE' OR cardinality("scope_ids") = 0)
        AND ("operation" <> 'detail' OR "result_count" <= 1)
        AND ("outcome" <> 'DENIED' OR "result_count" = 0)
        AND (
            "authorization_mode" <> 'intersect'
            OR "outcome" <> 'ALLOWED'
            OR (
                "policy_version" IS NOT NULL
                AND cardinality("assignment_ids") > 0
                AND cardinality("scope_ids") > 0
            )
        )
    )
);

-- CreateIndex
CREATE INDEX "auth_user_security_states_tenant_id_lifecycle_status_idx" ON "auth_user_security_states"("tenant_id", "lifecycle_status");
CREATE INDEX "auth_user_security_states_account_expires_at_idx" ON "auth_user_security_states"("account_expires_at");

CREATE UNIQUE INDEX "auth_org_units_tenant_id_id_key" ON "auth_org_units"("tenant_id", "id");
CREATE UNIQUE INDEX "auth_org_units_tenant_id_code_key" ON "auth_org_units"("tenant_id", "code");
CREATE UNIQUE INDEX "auth_org_units_tenant_id_hierarchy_path_key" ON "auth_org_units"("tenant_id", "hierarchy_path");
CREATE INDEX "auth_org_units_tenant_id_parent_id_status_idx" ON "auth_org_units"("tenant_id", "parent_id", "status");

CREATE UNIQUE INDEX "auth_org_unit_closure_tenant_ancestor_descendant_key" ON "auth_org_unit_closure"("tenant_id", "ancestor_id", "descendant_id");
CREATE INDEX "auth_org_unit_closure_tenant_descendant_depth_idx" ON "auth_org_unit_closure"("tenant_id", "descendant_id", "depth");

CREATE UNIQUE INDEX "auth_policy_bundles_policy_digest_key" ON "auth_policy_bundles"("policy_digest");
CREATE UNIQUE INDEX "auth_policy_bundles_namespace_version_key" ON "auth_policy_bundles"("namespace", "version");
CREATE INDEX "auth_policy_bundles_tenant_id_status_idx" ON "auth_policy_bundles"("tenant_id", "status");
CREATE INDEX "auth_policy_bundles_status_activated_at_idx" ON "auth_policy_bundles"("status", "activated_at");

CREATE INDEX "auth_capabilities_resource_type_action_idx" ON "auth_capabilities"("resource_type", "action");

CREATE UNIQUE INDEX "auth_role_definitions_tenant_id_id_key" ON "auth_role_definitions"("tenant_id", "id");
CREATE UNIQUE INDEX "auth_role_definitions_namespace_role_key_version_key" ON "auth_role_definitions"("namespace", "role_key", "version");
CREATE INDEX "auth_role_definitions_tenant_id_status_idx" ON "auth_role_definitions"("tenant_id", "status");
CREATE INDEX "auth_role_definitions_policy_bundle_id_idx" ON "auth_role_definitions"("policy_bundle_id");

CREATE UNIQUE INDEX "auth_role_capabilities_role_definition_capability_key" ON "auth_role_capabilities"("role_definition_id", "capability_key");
CREATE INDEX "auth_role_capabilities_capability_key_effect_idx" ON "auth_role_capabilities"("capability_key", "effect");

CREATE UNIQUE INDEX "auth_scopes_tenant_id_id_key" ON "auth_scopes"("tenant_id", "id");
CREATE UNIQUE INDEX "auth_scopes_tenant_id_normalized_digest_key" ON "auth_scopes"("tenant_id", "normalized_digest");
CREATE UNIQUE INDEX "auth_scopes_platform_digest_key" ON "auth_scopes"("normalized_digest") WHERE "tenant_id" IS NULL;
CREATE INDEX "auth_scopes_tenant_id_kind_status_idx" ON "auth_scopes"("tenant_id", "kind", "status");
CREATE INDEX "auth_scopes_org_unit_id_idx" ON "auth_scopes"("org_unit_id");
CREATE INDEX "auth_scopes_resource_type_resource_id_idx" ON "auth_scopes"("resource_type", "resource_id");

CREATE INDEX "auth_role_assignments_subject_status_valid_until_idx" ON "auth_role_assignments"("subject_user_id", "status", "valid_until");
CREATE INDEX "auth_role_assignments_tenant_role_status_idx" ON "auth_role_assignments"("tenant_id", "role_definition_id", "status");
CREATE INDEX "auth_role_assignments_scope_id_status_idx" ON "auth_role_assignments"("scope_id", "status");
CREATE INDEX "auth_role_assignments_approval_request_id_idx" ON "auth_role_assignments"("approval_request_id");

CREATE UNIQUE INDEX "security_audit_events_event_id_key" ON "security_audit_events"("event_id");
CREATE UNIQUE INDEX "security_audit_events_event_hash_key" ON "security_audit_events"("event_hash");
CREATE UNIQUE INDEX "security_audit_events_chain_partition_sequence_key" ON "security_audit_events"("chain_partition", "chain_sequence");
CREATE INDEX "security_audit_events_tenant_id_occurred_at_idx" ON "security_audit_events"("tenant_id", "occurred_at");
CREATE INDEX "security_audit_events_principal_hash_occurred_at_idx" ON "security_audit_events"("principal_hash", "occurred_at");
CREATE INDEX "security_audit_events_permission_purpose_occurred_at_idx" ON "security_audit_events"("permission", "purpose", "occurred_at");
CREATE INDEX "security_audit_events_correlation_id_idx" ON "security_audit_events"("correlation_id");

-- AddForeignKey
ALTER TABLE "auth_user_security_states" ADD CONSTRAINT "auth_user_security_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_user_security_states" ADD CONSTRAINT "auth_user_security_states_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_user_security_states" ADD CONSTRAINT "auth_user_security_states_tenant_user_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_user_security_states" ADD CONSTRAINT "auth_user_security_states_suspender_fkey" FOREIGN KEY ("suspended_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "auth_user_security_states" ADD CONSTRAINT "auth_user_security_states_revoker_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "auth_org_units" ADD CONSTRAINT "auth_org_units_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_org_units" ADD CONSTRAINT "auth_org_units_parent_tenant_fkey" FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "auth_org_units"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "auth_org_units" ADD CONSTRAINT "auth_org_units_creator_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "auth_org_unit_closure" ADD CONSTRAINT "auth_org_unit_closure_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_org_unit_closure" ADD CONSTRAINT "auth_org_unit_closure_ancestor_tenant_fkey" FOREIGN KEY ("tenant_id", "ancestor_id") REFERENCES "auth_org_units"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_org_unit_closure" ADD CONSTRAINT "auth_org_unit_closure_descendant_tenant_fkey" FOREIGN KEY ("tenant_id", "descendant_id") REFERENCES "auth_org_units"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auth_policy_bundles" ADD CONSTRAINT "auth_policy_bundles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_policy_bundles" ADD CONSTRAINT "auth_policy_bundles_creator_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "auth_role_definitions" ADD CONSTRAINT "auth_role_definitions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_role_definitions" ADD CONSTRAINT "auth_role_definitions_policy_bundle_fkey" FOREIGN KEY ("policy_bundle_id") REFERENCES "auth_policy_bundles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "auth_role_definitions" ADD CONSTRAINT "auth_role_definitions_creator_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "auth_role_capabilities" ADD CONSTRAINT "auth_role_capabilities_role_definition_fkey" FOREIGN KEY ("role_definition_id") REFERENCES "auth_role_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_role_capabilities" ADD CONSTRAINT "auth_role_capabilities_capability_fkey" FOREIGN KEY ("capability_key") REFERENCES "auth_capabilities"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "auth_scopes" ADD CONSTRAINT "auth_scopes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_scopes" ADD CONSTRAINT "auth_scopes_org_unit_tenant_fkey" FOREIGN KEY ("tenant_id", "org_unit_id") REFERENCES "auth_org_units"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "auth_scopes" ADD CONSTRAINT "auth_scopes_creator_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "auth_role_assignments" ADD CONSTRAINT "auth_role_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_role_assignments" ADD CONSTRAINT "auth_role_assignments_subject_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "auth_role_assignments" ADD CONSTRAINT "auth_role_assignments_subject_tenant_fkey" FOREIGN KEY ("tenant_id", "subject_user_id") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "auth_role_assignments" ADD CONSTRAINT "auth_role_assignments_role_definition_fkey" FOREIGN KEY ("role_definition_id") REFERENCES "auth_role_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "auth_role_assignments" ADD CONSTRAINT "auth_role_assignments_scope_fkey" FOREIGN KEY ("scope_id") REFERENCES "auth_scopes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "auth_role_assignments" ADD CONSTRAINT "auth_role_assignments_scope_tenant_fkey" FOREIGN KEY ("tenant_id", "scope_id") REFERENCES "auth_scopes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "auth_role_assignments" ADD CONSTRAINT "auth_role_assignments_requester_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "auth_role_assignments" ADD CONSTRAINT "auth_role_assignments_revoker_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "auth_role_assignments" ADD CONSTRAINT "auth_role_assignments_supersedes_fkey" FOREIGN KEY ("supersedes_assignment_id") REFERENCES "auth_role_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "security_audit_events" ADD CONSTRAINT "security_audit_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Security state must remain bound to the exact user tenant; governance actors may be global or same-tenant.
CREATE FUNCTION "auth_enforce_user_security_state_tenant"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "users" AS subject
        WHERE subject."id" = NEW."user_id"
          AND subject."tenantId" IS NOT DISTINCT FROM NEW."tenant_id"
    ) THEN
        RAISE EXCEPTION 'user security state is outside the tenant boundary'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."suspended_by_user_id" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "users" AS suspender
        WHERE suspender."id" = NEW."suspended_by_user_id"
          AND (suspender."tenantId" IS NULL OR suspender."tenantId" IS NOT DISTINCT FROM NEW."tenant_id")
    ) THEN
        RAISE EXCEPTION 'security state suspender is outside the tenant boundary'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."revoked_by_user_id" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "users" AS revoker
        WHERE revoker."id" = NEW."revoked_by_user_id"
          AND (revoker."tenantId" IS NULL OR revoker."tenantId" IS NOT DISTINCT FROM NEW."tenant_id")
    ) THEN
        RAISE EXCEPTION 'security state revoker is outside the tenant boundary'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "auth_user_security_states_tenant_guard"
BEFORE INSERT OR UPDATE ON "auth_user_security_states"
FOR EACH ROW EXECUTE FUNCTION "auth_enforce_user_security_state_tenant"();

-- Enforce global-or-same-tenant policy bundles and creation actors.
CREATE FUNCTION "auth_enforce_role_definition_tenant"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "auth_policy_bundles" AS bundle
        WHERE bundle."id" = NEW."policy_bundle_id"
          AND (bundle."tenant_id" IS NULL OR bundle."tenant_id" IS NOT DISTINCT FROM NEW."tenant_id")
    ) THEN
        RAISE EXCEPTION 'role definition tenant does not match policy bundle tenant'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."created_by_user_id" IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM "users" AS actor
        WHERE actor."id" = NEW."created_by_user_id"
          AND (actor."tenantId" IS NULL OR actor."tenantId" IS NOT DISTINCT FROM NEW."tenant_id")
    ) THEN
        RAISE EXCEPTION 'role definition creator is outside the tenant boundary'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "auth_role_definitions_tenant_guard"
BEFORE INSERT OR UPDATE ON "auth_role_definitions"
FOR EACH ROW EXECUTE FUNCTION "auth_enforce_role_definition_tenant"();

-- Assignments require an exact subject/scope tenant and a global-or-same-tenant role/actor.
CREATE FUNCTION "auth_enforce_role_assignment_tenant"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "users" AS subject
        WHERE subject."id" = NEW."subject_user_id"
          AND subject."tenantId" IS NOT DISTINCT FROM NEW."tenant_id"
    ) THEN
        RAISE EXCEPTION 'role assignment subject is outside the tenant boundary'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "auth_role_definitions" AS role_definition
        WHERE role_definition."id" = NEW."role_definition_id"
          AND (
              role_definition."tenant_id" IS NULL
              OR role_definition."tenant_id" IS NOT DISTINCT FROM NEW."tenant_id"
          )
    ) THEN
        RAISE EXCEPTION 'role assignment role is outside the tenant boundary'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "auth_scopes" AS scope
        WHERE scope."id" = NEW."scope_id"
          AND scope."tenant_id" IS NOT DISTINCT FROM NEW."tenant_id"
    ) THEN
        RAISE EXCEPTION 'role assignment scope is outside the tenant boundary'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "users" AS requester
        WHERE requester."id" = NEW."requested_by_user_id"
          AND (
              requester."tenantId" IS NULL
              OR requester."tenantId" IS NOT DISTINCT FROM NEW."tenant_id"
          )
    ) THEN
        RAISE EXCEPTION 'role assignment requester is outside the tenant boundary'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."revoked_by_user_id" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "users" AS revoker
        WHERE revoker."id" = NEW."revoked_by_user_id"
          AND (
              revoker."tenantId" IS NULL
              OR revoker."tenantId" IS NOT DISTINCT FROM NEW."tenant_id"
          )
    ) THEN
        RAISE EXCEPTION 'role assignment revoker is outside the tenant boundary'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."supersedes_assignment_id" IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "auth_role_assignments" AS prior_assignment
        WHERE prior_assignment."id" = NEW."supersedes_assignment_id"
          AND prior_assignment."tenant_id" IS NOT DISTINCT FROM NEW."tenant_id"
          AND prior_assignment."subject_user_id" = NEW."subject_user_id"
    ) THEN
        RAISE EXCEPTION 'superseded assignment is outside the subject and tenant boundary'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "auth_role_assignments_tenant_guard"
BEFORE INSERT OR UPDATE ON "auth_role_assignments"
FOR EACH ROW EXECUTE FUNCTION "auth_enforce_role_assignment_tenant"();

-- The security ledger is append-only, including direct SQL and TRUNCATE attempts.
CREATE FUNCTION "security_audit_events_deny_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'security_audit_events is append-only'
        USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER "security_audit_events_no_update_delete"
BEFORE UPDATE OR DELETE ON "security_audit_events"
FOR EACH ROW EXECUTE FUNCTION "security_audit_events_deny_mutation"();

CREATE TRIGGER "security_audit_events_no_truncate"
BEFORE TRUNCATE ON "security_audit_events"
FOR EACH STATEMENT EXECUTE FUNCTION "security_audit_events_deny_mutation"();

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "security_audit_events" FROM PUBLIC;
