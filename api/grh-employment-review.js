import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import { assertPrismaDatabaseTransport, prisma } from './lib/db.js';
import { inspectGrhEmploymentReviewContract } from './lib/grh-employment-review-contract.js';
import {
  buildGrhEmploymentReviewAggregateProjection,
  buildGrhEmploymentReviewProjection,
  GRH_EMPLOYMENT_REVIEW_SCHEMA_VERSION,
} from './lib/grh-employment-review-projection.js';
import { loadGrhDirectorySnapshotArtifact } from './lib/grh-directory-snapshot.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const { HEADER_NAME } = releaseTruthContract;
const { isPublishedDemoIdentity } = publishedDemoPolicy;
const SOURCE_SHA256_PATTERN = /^[0-9a-f]{64}$/;

const EMPLOYMENT_REVIEW_SQL = `SELECT source.schema_version,
       source.canonical_system,
       source.source_sha256,
       source.snapshot_as_of::text,
       source.record_count,
       COUNT(people.legajo)::int AS materialized_people,
       COUNT(*) FILTER (
         WHERE people.reported_status IS NOT NULL
           AND people.employment_basis = 'legajo_reported_dates'
           AND people.reference_payroll_period IS NOT NULL
           AND people.reference_payroll_observed IS NOT NULL
           AND people.reference_payroll_row_count IS NOT NULL
           AND people.reference_payroll_observed = (people.reference_payroll_row_count > 0)
       )::int AS employment_people,
       COUNT(DISTINCT people.reference_payroll_period)::int AS reference_period_count,
       MIN(people.reference_payroll_period) AS reference_period,
       COUNT(*) FILTER (
         WHERE people.reported_status = 'current_by_reported_dates'
       )::int AS reported_current_people,
       COUNT(*) FILTER (
         WHERE people.reported_status = 'ended_by_reported_dates'
       )::int AS reported_ended_people,
       COUNT(*) FILTER (
         WHERE people.reported_status IN (
           'unknown_missing_ingress',
           'unknown_sentinel_ingress',
           'unknown_implausible_active_tenure',
           'invalid_chronology'
         )
       )::int AS uncertain_people,
       COUNT(*) FILTER (
         WHERE people.reference_payroll_observed = TRUE
       )::int AS reference_payroll_participants,
       COUNT(*) FILTER (
         WHERE people.reported_status = 'current_by_reported_dates'
           AND people.reference_payroll_observed = TRUE
       )::int AS reported_current_with_reference_payroll,
       COUNT(*) FILTER (
         WHERE people.reported_status = 'current_by_reported_dates'
           AND people.reference_payroll_observed = FALSE
       )::int AS reported_current_without_reference_payroll,
       COUNT(*) FILTER (
         WHERE people.reported_status = 'ended_by_reported_dates'
           AND people.reference_payroll_observed = TRUE
       )::int AS reported_ended_with_reference_payroll,
       COUNT(*) FILTER (
         WHERE people.reported_status IN (
           'unknown_missing_ingress',
           'unknown_sentinel_ingress',
           'unknown_implausible_active_tenure',
           'invalid_chronology'
         )
           AND people.reference_payroll_observed = TRUE
       )::int AS uncertain_status_with_reference_payroll
  FROM grh_directory_sources source
  LEFT JOIN grh_directory_people people
    ON people.tenant_id = source.tenant_id
 WHERE source.tenant_id = $1
 GROUP BY source.schema_version, source.canonical_system, source.source_sha256,
          source.snapshot_as_of, source.record_count`;

function nonNegativeInteger(value) {
  const parsed = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('GRH employment aggregate invalid');
  return parsed;
}

async function defaultAggregateQuery(sql, values) {
  if (!assertPrismaDatabaseTransport()) throw new Error('GRH directory database unavailable');
  const rows = await prisma.$queryRawUnsafe(sql, ...values);
  return { rows };
}

async function defaultSnapshotQuery(sql, values) {
  if (!assertPrismaDatabaseTransport()) throw new Error('GRH directory snapshot unavailable');
  const rows = await prisma.$queryRawUnsafe(sql, ...values);
  return { rows };
}

export async function readGrhEmploymentReviewSnapshot({
  tenantId,
  key,
  queryImpl = defaultSnapshotQuery,
}) {
  return loadGrhDirectorySnapshotArtifact({ tenantId, key, queryImpl });
}

export async function readGrhEmploymentReviewAggregate({
  tenantId,
  queryImpl = defaultAggregateQuery,
}) {
  const result = await queryImpl(EMPLOYMENT_REVIEW_SQL, [tenantId]);
  const row = result?.rows?.[0];
  if (!row) throw new Error('GRH employment aggregate unavailable');
  return {
    source: {
      schemaVersion: String(row.schema_version),
      canonicalSystem: String(row.canonical_system),
      sourceSha256: String(row.source_sha256),
      snapshotAsOf: String(row.snapshot_as_of).slice(0, 10),
    },
    referencePeriod: String(row.reference_period),
    referencePeriodCount: nonNegativeInteger(row.reference_period_count),
    totalDirectoryPeople: nonNegativeInteger(row.record_count),
    materializedPeople: nonNegativeInteger(row.materialized_people),
    employmentPeople: nonNegativeInteger(row.employment_people),
    counts: {
      reported_current_people: nonNegativeInteger(row.reported_current_people),
      reported_ended_people: nonNegativeInteger(row.reported_ended_people),
      uncertain_people: nonNegativeInteger(row.uncertain_people),
      reference_payroll_participants: nonNegativeInteger(row.reference_payroll_participants),
      reported_current_with_reference_payroll:
        nonNegativeInteger(row.reported_current_with_reference_payroll),
      reported_current_without_reference_payroll:
        nonNegativeInteger(row.reported_current_without_reference_payroll),
      reported_ended_with_reference_payroll:
        nonNegativeInteger(row.reported_ended_with_reference_payroll),
      uncertain_status_with_reference_payroll:
        nonNegativeInteger(row.uncertain_status_with_reference_payroll),
    },
  };
}

function unavailable(res) {
  return res.status(503).json({
    error: 'La revisión de situaciones laborales no está disponible.',
    code: 'GRH_EMPLOYMENT_REVIEW_UNAVAILABLE',
  });
}

export function createGrhEmploymentReviewHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readAggregateImpl = readGrhEmploymentReviewAggregate,
  buildProjectionImpl = buildGrhEmploymentReviewAggregateProjection,
  readSnapshotImpl = readGrhEmploymentReviewSnapshot,
  buildSnapshotProjectionImpl = buildGrhEmploymentReviewProjection,
  inspectContractImpl = inspectGrhEmploymentReviewContract,
  isPublishedDemoIdentityImpl = isPublishedDemoIdentity,
  environment = process.env,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(HEADER_NAME || 'X-MuniControl-Contract', GRH_EMPLOYMENT_REVIEW_SCHEMA_VERSION);
    noStore(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Authorization');

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED' });
    }

    const caller = await requireCapabilityImpl(
      req,
      res,
      RESOURCES.GRH_ORGANIZATION_ANALYTICS,
      ACTIONS.READ,
    );
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    try {
      const expectedSha = environment.GRH_SOURCE_SHA256;
      if (!SOURCE_SHA256_PATTERN.test(expectedSha || '')) throw new Error('GRH source pin unavailable');
      const audience = isPublishedDemoIdentityImpl(caller.email) ? 'portable' : 'private';
      let projection;
      if (typeof environment.GRH_DIRECTORY_SNAPSHOT_KEY_V1 === 'string' &&
          environment.GRH_DIRECTORY_SNAPSHOT_KEY_V1.length > 0) {
        const artifact = await readSnapshotImpl({
          tenantId: String(caller.tenantId),
          key: environment.GRH_DIRECTORY_SNAPSHOT_KEY_V1,
        });
        if (artifact?.source?.sha256 !== expectedSha) {
          throw new Error('GRH employment review source invalid');
        }
        projection = buildSnapshotProjectionImpl(artifact, { audience });
      } else {
        const aggregate = await readAggregateImpl({
          tenantId: String(caller.tenantId),
        });
        if (aggregate?.source?.sourceSha256 !== expectedSha) {
          throw new Error('GRH employment review source invalid');
        }
        projection = buildProjectionImpl(aggregate, { audience });
      }
      if (!inspectContractImpl(projection)?.ok) throw new Error('GRH employment review contract invalid');
      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-EMPLOYMENT-REVIEW] Proyección no disponible');
      return unavailable(res);
    }
  };
}

export default createGrhEmploymentReviewHandler();
