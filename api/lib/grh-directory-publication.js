import { inspectGrhDirectoryArtifact } from './grh-directory-contract.js';

const SOURCE_UPSERT_SQL = `INSERT INTO grh_directory_sources
  (tenant_id, schema_version, canonical_system, source_file, source_sha256,
   snapshot_as_of, artifact_generated_at, record_count, leave_record_count,
   position_observation_count, published_at)
VALUES ($1, $2, $3, $4, $5, $6::date, $7::timestamptz, $8, $9, $10, NOW())
ON CONFLICT (tenant_id) DO UPDATE SET
  schema_version = EXCLUDED.schema_version,
  canonical_system = EXCLUDED.canonical_system,
  source_file = EXCLUDED.source_file,
  source_sha256 = EXCLUDED.source_sha256,
  snapshot_as_of = EXCLUDED.snapshot_as_of,
  artifact_generated_at = EXCLUDED.artifact_generated_at,
  record_count = EXCLUDED.record_count,
  leave_record_count = EXCLUDED.leave_record_count,
  position_observation_count = EXCLUDED.position_observation_count,
  published_at = NOW()`;

const DIMENSION_INSERT_SQL = `INSERT INTO grh_directory_dimensions
  (tenant_id, dimension, company_code, scope_code, code, label, parent_code, depends_on_code)
SELECT $1,
       item.dimension,
       item.company_code,
       item.scope_code,
       item.code,
       item.label,
       item.parent_code,
       item.depends_on_code
  FROM jsonb_to_recordset($2::jsonb) AS item(
    dimension TEXT,
    company_code INTEGER,
    scope_code INTEGER,
    code INTEGER,
    label TEXT,
    parent_code INTEGER,
    depends_on_code INTEGER
  )`;

const PEOPLE_INSERT_SQL = `INSERT INTO grh_directory_people
  (tenant_id, company_code, legajo, display_name, sector_code,
   organization_code, position_code, position_observation_label,
   position_observed_date, position_observed_period, position_observation_status,
   position_observation_source, category_code, agreement_code,
   absence_event_count, latest_absence_date, leave_event_count,
   latest_leave_start_date, latest_leave_end_date)
SELECT $1,
       item.company_code,
       item.legajo,
       item.display_name,
       item.sector_code,
       item.organization_code,
       item.position_code,
       item.position_observation_label,
       item.position_observed_date::date,
       item.position_observed_period,
       item.position_observation_status,
       item.position_observation_source,
       item.category_code,
       item.agreement_code,
       item.absence_event_count,
       item.latest_absence_date::date,
       item.leave_event_count,
       item.latest_leave_start_date::date,
       item.latest_leave_end_date::date
  FROM jsonb_to_recordset($2::jsonb) AS item(
    company_code INTEGER,
    legajo BIGINT,
    display_name TEXT,
    sector_code INTEGER,
    organization_code INTEGER,
    position_code INTEGER,
    position_observation_label TEXT,
    position_observed_date TEXT,
    position_observed_period TEXT,
    position_observation_status TEXT,
    position_observation_source TEXT,
    category_code INTEGER,
    agreement_code INTEGER,
    absence_event_count INTEGER,
    latest_absence_date TEXT,
    leave_event_count INTEGER,
    latest_leave_start_date TEXT,
    latest_leave_end_date TEXT
  )`;

const LEAVE_INSERT_SQL = `INSERT INTO grh_directory_leave_events
  (tenant_id, company_code, legajo, event_order, start_date, end_date, days)
SELECT $1,
       item.company_code,
       item.legajo,
       item.event_order,
       item.start_date::date,
       item.end_date::date,
       item.days
  FROM jsonb_to_recordset($2::jsonb) AS item(
    company_code INTEGER,
    legajo BIGINT,
    event_order INTEGER,
    start_date TEXT,
    end_date TEXT,
    days INTEGER
  )`;

const DIMENSION_NAMES = Object.freeze([
  'sector',
  'organization',
  'position',
  'category',
  'agreement',
]);

function publicationError(code) {
  const error = new Error('No se pudo materializar el directorio GRH.');
  error.code = code;
  return error;
}

function validTenantId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function flattenGrhDirectoryArtifact(artifact) {
  const dimensions = new Map();
  const leaveEvents = [];
  const mergeDimension = (key, next) => {
    const existing = dimensions.get(key);
    for (const field of ['label', 'parent_code', 'depends_on_code']) {
      if (existing?.[field] !== null && existing?.[field] !== undefined &&
          next[field] !== null && next[field] !== undefined &&
          existing[field] !== next[field]) {
        throw publicationError('GRH_DIRECTORY_DIMENSION_CONFLICT');
      }
    }
    dimensions.set(key, {
      ...next,
      label: existing?.label ?? next.label,
      parent_code: existing?.parent_code ?? next.parent_code,
      depends_on_code: existing?.depends_on_code ?? next.depends_on_code,
    });
  };
  const people = artifact.records.map(record => {
    for (const dimension of DIMENSION_NAMES) {
      const value = record[dimension];
      if (!value) continue;
      const companyCode = dimension === 'agreement' ? 0 : record.company_code;
      const scopeCode = dimension === 'category' ? record.agreement?.code ?? 0 : 0;
      const key = [dimension, companyCode, scopeCode, value.code].join(':');
      const next = {
        dimension,
        company_code: companyCode,
        scope_code: scopeCode,
        code: value.code,
        label: value.label,
        parent_code: dimension === 'position' ? value.parent?.code ?? null : null,
        depends_on_code: dimension === 'position' ? value.depends_on?.code ?? null : null,
      };
      mergeDimension(key, next);
      if (dimension === 'position') {
        for (const relation of [value.parent, value.depends_on]) {
          if (!relation) continue;
          const relationKey = ['position', companyCode, 0, relation.code].join(':');
          mergeDimension(relationKey, {
            dimension: 'position',
            company_code: companyCode,
            scope_code: 0,
            code: relation.code,
            label: relation.label,
            parent_code: null,
            depends_on_code: null,
          });
        }
      }
    }
    record.leave_history.forEach((event, index) => {
      leaveEvents.push({
        company_code: record.company_code,
        legajo: record.legajo,
        event_order: index + 1,
        start_date: event.start_date,
        end_date: event.end_date,
        days: event.days,
      });
    });
    return {
      company_code: record.company_code,
      legajo: record.legajo,
      display_name: record.display_name,
      sector_code: record.sector?.code ?? null,
      organization_code: record.organization?.code ?? null,
      position_code: record.position?.code ?? null,
      position_observation_label: record.position_observation?.label ?? null,
      position_observed_date: record.position_observation?.observed_date ?? null,
      position_observed_period: record.position_observation?.observed_period ?? null,
      position_observation_status: record.position_observation?.status ?? null,
      position_observation_source: record.position_observation?.source_table ?? null,
      category_code: record.category?.code ?? null,
      agreement_code: record.agreement?.code ?? null,
      absence_event_count: record.absence.event_count,
      latest_absence_date: record.absence.latest_date,
      leave_event_count: record.leave.event_count,
      latest_leave_start_date: record.leave.latest_start_date,
      latest_leave_end_date: record.leave.latest_end_date,
    };
  });
  return Object.freeze({
    dimensions: Object.freeze([...dimensions.values()].sort((left, right) => (
      left.dimension.localeCompare(right.dimension) ||
      left.company_code - right.company_code ||
      left.scope_code - right.scope_code ||
      left.code - right.code
    ))),
    people: Object.freeze(people),
    leaveEvents: Object.freeze(leaveEvents),
  });
}

export async function publishGrhDirectory(
  client,
  tenantId,
  artifact,
  { chunkSize = 250, transactionMode = 'managed' } = {},
) {
  if (!client || typeof client.query !== 'function') {
    throw new TypeError('PoolClient GRH directory invalido');
  }
  if (!validTenantId(tenantId)) throw publicationError('GRH_DIRECTORY_TENANT_INVALID');
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 1000) {
    throw publicationError('GRH_DIRECTORY_CHUNK_INVALID');
  }
  if (!['managed', 'external'].includes(transactionMode)) {
    throw publicationError('GRH_DIRECTORY_TRANSACTION_MODE_INVALID');
  }
  if (!inspectGrhDirectoryArtifact(artifact).ok) {
    throw publicationError('GRH_DIRECTORY_ARTIFACT_INVALID');
  }
  const flattened = flattenGrhDirectoryArtifact(artifact);
  const positionObservationCount = flattened.people.filter(
    person => person.position_observation_label !== null,
  ).length;
  if (transactionMode === 'managed') await client.query('BEGIN');
  try {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('grh-directory-v1'), hashtext($1))",
      [tenantId],
    );
    const existing = await client.query(
      `SELECT schema_version, source_sha256, snapshot_as_of::text, record_count, leave_record_count,
              position_observation_count
         FROM grh_directory_sources
        WHERE tenant_id = $1
        FOR UPDATE`,
      [tenantId],
    );
    const current = existing.rows?.[0];
    if (current &&
        current.schema_version === artifact.schema_version &&
        current.source_sha256 === artifact.source.sha256 &&
        current.snapshot_as_of === artifact.source.snapshot_as_of &&
        Number(current.record_count) === flattened.people.length &&
        Number(current.leave_record_count) === flattened.leaveEvents.length &&
        Number(current.position_observation_count) === positionObservationCount) {
      const counts = await client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM grh_directory_people WHERE tenant_id = $1) AS people,
           (SELECT COUNT(*)::int FROM grh_directory_dimensions WHERE tenant_id = $1) AS dimensions,
           (SELECT COUNT(*)::int FROM grh_directory_leave_events WHERE tenant_id = $1) AS leave_events,
           (SELECT COUNT(*)::int FROM grh_directory_people
             WHERE tenant_id = $1 AND position_observation_label IS NOT NULL) AS position_observations`,
        [tenantId],
      );
      if (Number(counts.rows?.[0]?.people) === flattened.people.length &&
          Number(counts.rows?.[0]?.dimensions) === flattened.dimensions.length &&
          Number(counts.rows?.[0]?.leave_events) === flattened.leaveEvents.length &&
          Number(counts.rows?.[0]?.position_observations) === positionObservationCount) {
        if (transactionMode === 'managed') await client.query('COMMIT');
        return Object.freeze({ status: 'unchanged' });
      }
    }

    await client.query('DELETE FROM grh_directory_people WHERE tenant_id = $1', [tenantId]);
    await client.query('DELETE FROM grh_directory_dimensions WHERE tenant_id = $1', [tenantId]);
    await client.query(SOURCE_UPSERT_SQL, [
      tenantId,
      artifact.schema_version,
      artifact.source.canonical_system,
      artifact.source.file,
      artifact.source.sha256,
      artifact.source.snapshot_as_of,
      artifact.source.generated_at,
      flattened.people.length,
      flattened.leaveEvents.length,
      positionObservationCount,
    ]);
    for (const batch of chunks(flattened.dimensions, chunkSize)) {
      await client.query(DIMENSION_INSERT_SQL, [tenantId, JSON.stringify(batch)]);
    }
    for (const batch of chunks(flattened.people, chunkSize)) {
      await client.query(PEOPLE_INSERT_SQL, [tenantId, JSON.stringify(batch)]);
    }
    for (const batch of chunks(flattened.leaveEvents, chunkSize)) {
      await client.query(LEAVE_INSERT_SQL, [tenantId, JSON.stringify(batch)]);
    }
    const verified = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM grh_directory_people WHERE tenant_id = $1) AS people,
         (SELECT COUNT(*)::int FROM grh_directory_dimensions WHERE tenant_id = $1) AS dimensions,
         (SELECT COUNT(*)::int FROM grh_directory_leave_events WHERE tenant_id = $1) AS leave_events,
         (SELECT COUNT(*)::int FROM grh_directory_people
           WHERE tenant_id = $1 AND position_observation_label IS NOT NULL) AS position_observations`,
      [tenantId],
    );
    if (Number(verified.rows?.[0]?.people) !== flattened.people.length ||
        Number(verified.rows?.[0]?.dimensions) !== flattened.dimensions.length ||
        Number(verified.rows?.[0]?.leave_events) !== flattened.leaveEvents.length ||
        Number(verified.rows?.[0]?.position_observations) !== positionObservationCount) {
      throw publicationError('GRH_DIRECTORY_PUBLICATION_COUNT_MISMATCH');
    }
    if (transactionMode === 'managed') await client.query('COMMIT');
    return Object.freeze({ status: current ? 'replaced' : 'published' });
  } catch (error) {
    if (transactionMode === 'managed') await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
