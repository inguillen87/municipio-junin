import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import { assertPrismaDatabaseTransport, prisma } from './lib/db.js';
import {
  GRH_ADMINISTRATION_COMPARISON_PERIODS,
  GRH_ADMINISTRATION_COMPARISON_SCHEMA_VERSION,
  inspectGrhAdministrationComparisonContract,
} from './lib/grh-administration-comparison-contract.js';
import {
  buildGrhAdministrationComparisonProjection,
} from './lib/grh-administration-comparison-projection.js';
import routePolicy from '../shared/route-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';
import { loadGrhDirectorySnapshotArtifact } from './lib/grh-directory-snapshot.js';
import { grhDirectoryContentSha256 } from './lib/grh-directory-publication.js';

const { ACTIONS, RESOURCES } = routePolicy;
const { HEADER_NAME } = releaseTruthContract;
const { isPublishedDemoIdentity } = publishedDemoPolicy;
const HEX_64 = /^[0-9a-f]{64}$/;

// The two periods are product-governed calendar spans. They are literals on
// purpose: callers cannot shift the comparison or turn this aggregate endpoint
// into a personal-history query. Source identity, materialization identity and
// all metrics are read in this single tenant-bound statement.
const ADMINISTRATION_COMPARISON_SQL = `WITH selected_source AS (
  SELECT source.schema_version,
         source.canonical_system,
         source.source_sha256,
         source.content_sha256,
         source.snapshot_as_of,
         source.record_count,
         source.absence_record_count
    FROM grh_directory_sources source
   WHERE source.tenant_id = $1
     AND source.source_sha256 = $2
     AND source.schema_version = 'grh-directory-v3'
),
people_identity AS (
  SELECT COUNT(*)::int AS materialized_people,
         COUNT(DISTINCT (people.company_code, people.legajo))::int AS unique_people,
         COUNT(*) FILTER (
           WHERE people.reported_status IS NOT NULL
             AND people.employment_basis = 'legajo_reported_dates'
             AND people.employment_as_of IS NOT NULL
             AND people.reference_payroll_period IS NOT NULL
             AND people.reference_payroll_observed IS NOT NULL
             AND people.reference_payroll_row_count IS NOT NULL
             AND people.reference_payroll_observed = (people.reference_payroll_row_count > 0)
         )::int AS employment_people,
         COUNT(*) FILTER (
           WHERE people.content_sha256 ~ '^[0-9a-f]{64}$'
         )::int AS digested_people
    FROM grh_directory_people people
   WHERE people.tenant_id = $1
),
absence_identity AS (
  SELECT COUNT(*)::int AS materialized_absence_events
    FROM grh_directory_absence_events events
   WHERE events.tenant_id = $1
),
periods AS (
  SELECT *
    FROM (VALUES
      ('current'::text, DATE '2023-12-09', DATE '2026-08-06'),
      ('prior'::text, DATE '2019-12-09', DATE '2022-08-06')
    ) AS governed_periods(period_key, start_date, end_date)
),
absence_metrics AS (
  SELECT period.period_key,
         COUNT(events.event_order)::int AS event_rows,
         COUNT(DISTINCT (events.company_code, events.legajo))::int AS distinct_people,
         COALESCE(SUM(events.days) FILTER (WHERE events.days IS NOT NULL), 0)::bigint AS reported_days,
         COUNT(events.event_order) FILTER (WHERE events.days IS NOT NULL)::int AS known_event_rows,
         COUNT(events.event_order) FILTER (WHERE events.days IS NULL)::int AS missing_event_rows
    FROM periods period
    LEFT JOIN grh_directory_absence_events events
      ON events.tenant_id = $1
     AND events.event_date BETWEEN period.start_date AND period.end_date
   GROUP BY period.period_key
),
employment_metrics AS (
  SELECT period.period_key,
         COUNT(people.legajo) FILTER (
           WHERE people.reported_ingress_date BETWEEN period.start_date AND period.end_date
         )::int AS reported_ingress_dates,
         COUNT(people.legajo) FILTER (
           WHERE people.reported_exit_date BETWEEN period.start_date AND period.end_date
         )::int AS reported_exit_dates
    FROM periods period
    LEFT JOIN grh_directory_people people
      ON people.tenant_id = $1
   GROUP BY period.period_key
)
SELECT source.schema_version,
       source.canonical_system,
       source.source_sha256,
       source.content_sha256,
       source.snapshot_as_of::text,
       source.record_count,
       source.absence_record_count,
       people.materialized_people,
       people.unique_people,
       people.employment_people,
       people.digested_people,
       absence_identity.materialized_absence_events,
       MAX(absence.event_rows) FILTER (WHERE absence.period_key = 'current')::int AS current_event_rows,
       MAX(absence.distinct_people) FILTER (WHERE absence.period_key = 'current')::int AS current_distinct_people,
       MAX(absence.reported_days) FILTER (WHERE absence.period_key = 'current')::bigint AS current_reported_days,
       MAX(absence.known_event_rows) FILTER (WHERE absence.period_key = 'current')::int AS current_known_event_rows,
       MAX(absence.missing_event_rows) FILTER (WHERE absence.period_key = 'current')::int AS current_missing_event_rows,
       MAX(employment.reported_ingress_dates) FILTER (WHERE employment.period_key = 'current')::int AS current_reported_ingress_dates,
       MAX(employment.reported_exit_dates) FILTER (WHERE employment.period_key = 'current')::int AS current_reported_exit_dates,
       MAX(absence.event_rows) FILTER (WHERE absence.period_key = 'prior')::int AS prior_event_rows,
       MAX(absence.distinct_people) FILTER (WHERE absence.period_key = 'prior')::int AS prior_distinct_people,
       MAX(absence.reported_days) FILTER (WHERE absence.period_key = 'prior')::bigint AS prior_reported_days,
       MAX(absence.known_event_rows) FILTER (WHERE absence.period_key = 'prior')::int AS prior_known_event_rows,
       MAX(absence.missing_event_rows) FILTER (WHERE absence.period_key = 'prior')::int AS prior_missing_event_rows,
       MAX(employment.reported_ingress_dates) FILTER (WHERE employment.period_key = 'prior')::int AS prior_reported_ingress_dates,
       MAX(employment.reported_exit_dates) FILTER (WHERE employment.period_key = 'prior')::int AS prior_reported_exit_dates
  FROM selected_source source
 CROSS JOIN people_identity people
 CROSS JOIN absence_identity
 CROSS JOIN absence_metrics absence
 CROSS JOIN employment_metrics employment
 GROUP BY source.schema_version, source.canonical_system, source.source_sha256,
          source.content_sha256, source.snapshot_as_of, source.record_count,
          source.absence_record_count, people.materialized_people, people.unique_people,
          people.employment_people, people.digested_people,
          absence_identity.materialized_absence_events`;

function nonNegativeInteger(value) {
  const parsed = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('GRH administration comparison aggregate invalid');
  }
  return parsed;
}

async function defaultAggregateQuery(sql, values) {
  if (!assertPrismaDatabaseTransport()) {
    throw new Error('GRH directory database unavailable');
  }
  const rows = await prisma.$queryRawUnsafe(sql, ...values);
  return { rows };
}

async function defaultSnapshotQuery(sql, values) {
  if (!assertPrismaDatabaseTransport()) throw new Error('GRH directory snapshot unavailable');
  const rows = await prisma.$queryRawUnsafe(sql, ...values);
  return { rows };
}

function metricsFromArtifact(records, startDate, endDate) {
  const participants = new Set();
  let eventRows = 0;
  let reportedDays = 0;
  let knownEventRows = 0;
  let missingEventRows = 0;
  let reportedIngressDates = 0;
  let reportedExitDates = 0;
  for (const record of records) {
    const employment = record.employment;
    if (employment.reported_ingress_date !== null &&
        employment.reported_ingress_date >= startDate && employment.reported_ingress_date <= endDate) {
      reportedIngressDates += 1;
    }
    if (employment.reported_exit_date !== null &&
        employment.reported_exit_date >= startDate && employment.reported_exit_date <= endDate) {
      reportedExitDates += 1;
    }
    for (const event of record.absence_history) {
      if (event.date < startDate || event.date > endDate) continue;
      eventRows += 1;
      participants.add(`${record.company_code}:${record.legajo}`);
      if (event.days === null) {
        missingEventRows += 1;
      } else {
        knownEventRows += 1;
        reportedDays += event.days;
      }
    }
  }
  return {
    eventRows,
    distinctPeople: participants.size,
    reportedDays,
    knownEventRows,
    missingEventRows,
    reportedIngressDates,
    reportedExitDates,
  };
}

export function buildGrhAdministrationComparisonAggregateFromArtifact(artifact) {
  const records = artifact?.records;
  if (!Array.isArray(records)) throw new Error('GRH administration comparison snapshot invalid');
  const recordCount = records.length;
  const absenceEventCount = records.reduce(
    (total, record) => total + record.absence_history.length,
    0,
  );
  const employmentPeople = records.filter(record => {
    const employment = record?.employment;
    const payroll = employment?.reference_payroll_participation;
    return employment?.basis === 'legajo_reported_dates' &&
      typeof employment?.reported_status === 'string' &&
      typeof payroll?.period === 'string' &&
      typeof payroll?.observed === 'boolean' &&
      Number.isSafeInteger(payroll?.row_count) && payroll.row_count >= 0 &&
      payroll.observed === (payroll.row_count > 0);
  }).length;
  return {
    source: {
      schemaVersion: artifact.schema_version,
      canonicalSystem: artifact.source.canonical_system,
      sourceSha256: artifact.source.sha256,
      contentSha256: grhDirectoryContentSha256(artifact),
      snapshotAsOf: artifact.source.snapshot_as_of,
      recordCount,
      absenceEventCount,
    },
    identity: {
      materializedPeople: recordCount,
      uniquePeople: new Set(records.map(record => `${record.company_code}:${record.legajo}`)).size,
      employmentPeople,
      digestedPeople: recordCount,
      materializedAbsenceEvents: absenceEventCount,
    },
    current: metricsFromArtifact(
      records,
      GRH_ADMINISTRATION_COMPARISON_PERIODS.current.startDate,
      GRH_ADMINISTRATION_COMPARISON_PERIODS.current.endDate,
    ),
    prior: metricsFromArtifact(
      records,
      GRH_ADMINISTRATION_COMPARISON_PERIODS.prior.startDate,
      GRH_ADMINISTRATION_COMPARISON_PERIODS.prior.endDate,
    ),
  };
}

export async function readGrhAdministrationComparisonSnapshot({
  tenantId,
  key,
  queryImpl = defaultSnapshotQuery,
}) {
  const artifact = await loadGrhDirectorySnapshotArtifact({ tenantId, key, queryImpl });
  return buildGrhAdministrationComparisonAggregateFromArtifact(artifact);
}

function periodFromRow(row, prefix) {
  return {
    eventRows: nonNegativeInteger(row[`${prefix}_event_rows`]),
    distinctPeople: nonNegativeInteger(row[`${prefix}_distinct_people`]),
    reportedDays: nonNegativeInteger(row[`${prefix}_reported_days`]),
    knownEventRows: nonNegativeInteger(row[`${prefix}_known_event_rows`]),
    missingEventRows: nonNegativeInteger(row[`${prefix}_missing_event_rows`]),
    reportedIngressDates: nonNegativeInteger(row[`${prefix}_reported_ingress_dates`]),
    reportedExitDates: nonNegativeInteger(row[`${prefix}_reported_exit_dates`]),
  };
}

export async function readGrhAdministrationComparisonAggregate({
  tenantId,
  sourceSha256,
  queryImpl = defaultAggregateQuery,
}) {
  if (typeof tenantId !== 'string' || tenantId.length === 0 || !HEX_64.test(sourceSha256 || '')) {
    throw new Error('GRH administration comparison query invalid');
  }
  const result = await queryImpl(ADMINISTRATION_COMPARISON_SQL, [tenantId, sourceSha256]);
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  if (rows.length !== 1) throw new Error('GRH administration comparison unavailable');
  const row = rows[0];
  return {
    source: {
      schemaVersion: String(row.schema_version),
      canonicalSystem: String(row.canonical_system),
      sourceSha256: String(row.source_sha256),
      contentSha256: String(row.content_sha256),
      snapshotAsOf: String(row.snapshot_as_of).slice(0, 10),
      recordCount: nonNegativeInteger(row.record_count),
      absenceEventCount: nonNegativeInteger(row.absence_record_count),
    },
    identity: {
      materializedPeople: nonNegativeInteger(row.materialized_people),
      uniquePeople: nonNegativeInteger(row.unique_people),
      employmentPeople: nonNegativeInteger(row.employment_people),
      digestedPeople: nonNegativeInteger(row.digested_people),
      materializedAbsenceEvents: nonNegativeInteger(row.materialized_absence_events),
    },
    current: periodFromRow(row, 'current'),
    prior: periodFromRow(row, 'prior'),
  };
}

function unavailable(res) {
  return res.status(503).json({
    error: 'La comparación de períodos administrativos no está disponible.',
    code: 'GRH_ADMINISTRATION_COMPARISON_UNAVAILABLE',
  });
}

export function createGrhAdministrationComparisonHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readAggregateImpl = readGrhAdministrationComparisonAggregate,
  readSnapshotAggregateImpl = readGrhAdministrationComparisonSnapshot,
  buildProjectionImpl = buildGrhAdministrationComparisonProjection,
  inspectContractImpl = inspectGrhAdministrationComparisonContract,
  isPublishedDemoIdentityImpl = isPublishedDemoIdentity,
  environment = process.env,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(
      HEADER_NAME || 'X-MuniControl-Contract',
      GRH_ADMINISTRATION_COMPARISON_SCHEMA_VERSION,
    );
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

    if (req.query && Object.keys(req.query).length > 0) {
      return res.status(400).json({
        error: 'La comparación usa períodos fijos y no acepta filtros.',
        code: 'GRH_ADMINISTRATION_COMPARISON_QUERY_INVALID',
      });
    }

    try {
      const sourceSha256 = environment.GRH_SOURCE_SHA256;
      if (!HEX_64.test(sourceSha256 || '')) throw new Error('GRH source pin unavailable');
      const snapshotKey = environment.GRH_DIRECTORY_SNAPSHOT_KEY_V1;
      const aggregate = typeof snapshotKey === 'string' && snapshotKey.length > 0
        ? await readSnapshotAggregateImpl({
          tenantId: String(caller.tenantId),
          key: snapshotKey,
        })
        : await readAggregateImpl({
          tenantId: String(caller.tenantId),
          sourceSha256,
        });
      if (aggregate?.source?.sourceSha256 !== sourceSha256) {
        throw new Error('GRH administration comparison source invalid');
      }
      const audience = isPublishedDemoIdentityImpl(caller.email) ? 'portable' : 'private';
      const projection = buildProjectionImpl(aggregate, { audience });
      if (!inspectContractImpl(projection)?.ok) {
        throw new Error('GRH administration comparison contract invalid');
      }
      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-ADMINISTRATION-COMPARISON] Proyección gobernada no disponible');
      return unavailable(res);
    }
  };
}

export default createGrhAdministrationComparisonHandler();
