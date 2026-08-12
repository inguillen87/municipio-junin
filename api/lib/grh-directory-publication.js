import { createHash } from 'node:crypto';

import { inspectGrhDirectoryArtifact } from './grh-directory-contract.js';

const SOURCE_UPSERT_SQL = `INSERT INTO grh_directory_sources
  (tenant_id, schema_version, canonical_system, source_file, source_sha256,
   snapshot_as_of, artifact_generated_at, record_count, leave_record_count,
   position_observation_count, absence_record_count, movement_period_count, content_sha256, published_at)
VALUES ($1, $2, $3, $4, $5, $6::date, $7::timestamptz, $8, $9, $10, $11, $12, $13, NOW())
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
  absence_record_count = EXCLUDED.absence_record_count,
  movement_period_count = EXCLUDED.movement_period_count,
  content_sha256 = EXCLUDED.content_sha256,
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
   cost_center_code, organization_code, position_code, position_observation_label,
   position_observed_date, position_observed_period, position_observation_status,
   position_observation_source, category_code, agreement_code,
   absence_event_count, latest_absence_date, leave_event_count,
   latest_leave_start_date, latest_leave_end_date, movement_row_count,
    movement_period_count, latest_movement_period, reported_ingress_date,
    reported_exit_date, reported_status, employment_as_of, employment_basis,
    reference_payroll_period, reference_payroll_observed, reference_payroll_row_count,
    contract_regime_code, service_situation_code, termination_reason_code, content_sha256)
SELECT $1,
       item.company_code,
       item.legajo,
       item.display_name,
       item.sector_code,
       item.cost_center_code,
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
       item.latest_leave_end_date::date,
       item.movement_row_count,
       item.movement_period_count,
       item.latest_movement_period,
       item.reported_ingress_date::date,
       item.reported_exit_date::date,
       item.reported_status,
       item.employment_as_of::date,
       item.employment_basis,
       item.reference_payroll_period,
       item.reference_payroll_observed,
       item.reference_payroll_row_count,
       item.contract_regime_code,
       item.service_situation_code,
       item.termination_reason_code,
       item.content_sha256
  FROM jsonb_to_recordset($2::jsonb) AS item(
    company_code INTEGER,
    legajo BIGINT,
    display_name TEXT,
    sector_code INTEGER,
    cost_center_code INTEGER,
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
    latest_leave_end_date TEXT,
    movement_row_count INTEGER,
    movement_period_count INTEGER,
    latest_movement_period TEXT,
    reported_ingress_date TEXT,
    reported_exit_date TEXT,
    reported_status TEXT,
    employment_as_of TEXT,
    employment_basis TEXT,
    reference_payroll_period TEXT,
    reference_payroll_observed BOOLEAN,
    reference_payroll_row_count INTEGER,
    contract_regime_code INTEGER,
    service_situation_code INTEGER,
    termination_reason_code INTEGER,
    content_sha256 TEXT
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

const ABSENCE_INSERT_SQL = `INSERT INTO grh_directory_absence_events
  (tenant_id, company_code, legajo, event_order, event_date, days)
SELECT $1,
       item.company_code,
       item.legajo,
       item.event_order,
       item.event_date::date,
       item.days
  FROM jsonb_to_recordset($2::jsonb) AS item(
    company_code INTEGER,
    legajo BIGINT,
    event_order INTEGER,
    event_date TEXT,
    days INTEGER
  )`;

const MOVEMENT_INSERT_SQL = `INSERT INTO grh_directory_movement_periods
  (tenant_id, company_code, legajo, period, row_count)
SELECT $1,
       item.company_code,
       item.legajo,
       item.period,
       item.row_count
  FROM jsonb_to_recordset($2::jsonb) AS item(
    company_code INTEGER,
    legajo BIGINT,
    period TEXT,
    row_count INTEGER
  )`;

const DIMENSION_SPECS = Object.freeze([
  Object.freeze({ artifact: 'sector', storage: 'sector' }),
  Object.freeze({ artifact: 'cost_center', storage: 'costCenter' }),
  Object.freeze({ artifact: 'organization', storage: 'organization' }),
  Object.freeze({ artifact: 'position', storage: 'position' }),
  Object.freeze({ artifact: 'category', storage: 'category' }),
  Object.freeze({ artifact: 'agreement', storage: 'agreement', global: true }),
  Object.freeze({ artifact: 'contract_regime', storage: 'contractRegime', global: true }),
  Object.freeze({ artifact: 'service_situation', storage: 'serviceSituation', global: true }),
  Object.freeze({ artifact: 'termination_reason', storage: 'terminationReason', global: true }),
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

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => (
      JSON.stringify(key) + ':' + canonicalJson(value[key])
    )).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function governedDirectoryContent(artifact) {
  return {
    schemaVersion: artifact.schema_version,
    canonicalSystem: artifact.source.canonical_system,
    sourceFile: artifact.source.file,
    sourceSha256: artifact.source.sha256,
    snapshotAsOf: artifact.source.snapshot_as_of,
    records: artifact.records,
  };
}

export function grhDirectoryContentSha256(artifact) {
  if (!inspectGrhDirectoryArtifact(artifact).ok) {
    throw publicationError('GRH_DIRECTORY_ARTIFACT_INVALID');
  }
  return sha256(governedDirectoryContent(artifact));
}

export function flattenGrhDirectoryArtifact(artifact) {
  const dimensions = new Map();
  const absenceEvents = [];
  const leaveEvents = [];
  const movementPeriods = [];
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
    for (const spec of DIMENSION_SPECS) {
      const dimension = spec.storage;
      const value = record[spec.artifact];
      if (!value) continue;
      const companyCode = spec.global ? 0 : record.company_code;
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
    record.absence_history.forEach((event, index) => {
      absenceEvents.push({
        company_code: record.company_code,
        legajo: record.legajo,
        event_order: index + 1,
        event_date: event.date,
        days: event.days,
      });
    });
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
    record.movement_history.forEach(event => {
      movementPeriods.push({
        company_code: record.company_code,
        legajo: record.legajo,
        period: event.period,
        row_count: event.row_count,
      });
    });
    const employment = record.employment;
    return {
      company_code: record.company_code,
      legajo: record.legajo,
      display_name: record.display_name,
      sector_code: record.sector?.code ?? null,
      cost_center_code: record.cost_center?.code ?? null,
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
      movement_row_count: record.movement.row_count,
      movement_period_count: record.movement.period_count,
      latest_movement_period: record.movement.latest_period,
      reported_ingress_date: employment.reported_ingress_date,
      reported_exit_date: employment.reported_exit_date,
      reported_status: employment.reported_status,
      employment_as_of: employment.as_of,
      employment_basis: employment.basis,
      reference_payroll_period: employment.reference_payroll_participation.period,
      reference_payroll_observed: employment.reference_payroll_participation.observed,
      reference_payroll_row_count: employment.reference_payroll_participation.row_count,
      contract_regime_code: record.contract_regime?.code ?? null,
      service_situation_code: record.service_situation?.code ?? null,
      termination_reason_code: record.termination_reason?.code ?? null,
      content_sha256: sha256(record),
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
    absenceEvents: Object.freeze(absenceEvents),
    leaveEvents: Object.freeze(leaveEvents),
    movementPeriods: Object.freeze(movementPeriods),
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
  const contentSha256 = grhDirectoryContentSha256(artifact);
  const positionObservationCount = flattened.people.filter(
    person => person.position_observation_label !== null,
  ).length;
  if (transactionMode === 'managed') await client.query('BEGIN');
  try {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('grh-directory-v3'), hashtext($1))",
      [tenantId],
    );
    const existing = await client.query(
      `SELECT schema_version, source_sha256, snapshot_as_of::text, record_count, leave_record_count,
               position_observation_count, absence_record_count, movement_period_count, content_sha256
         FROM grh_directory_sources
        WHERE tenant_id = $1
        FOR UPDATE`,
      [tenantId],
    );
    const current = existing.rows?.[0];
    const sameContent = current?.schema_version === artifact.schema_version &&
      current?.source_sha256 === artifact.source.sha256 &&
      String(current?.snapshot_as_of) === artifact.source.snapshot_as_of &&
      current?.content_sha256 === contentSha256;
    // A digest stored beside the rows cannot prove that those rows were not
    // changed out of band. Rebuild every materialized family transactionally,
    // even for the same governed digest. This keeps replay idempotent while it
    // also repairs equal-cardinality drift in people, dimensions and histories.
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
      flattened.absenceEvents.length,
      flattened.movementPeriods.length,
      contentSha256,
    ]);
    for (const batch of chunks(flattened.dimensions, chunkSize)) {
      await client.query(DIMENSION_INSERT_SQL, [tenantId, JSON.stringify(batch)]);
    }
    for (const batch of chunks(flattened.people, chunkSize)) {
      await client.query(PEOPLE_INSERT_SQL, [tenantId, JSON.stringify(batch)]);
    }
    for (const batch of chunks(flattened.absenceEvents, chunkSize)) {
      await client.query(ABSENCE_INSERT_SQL, [tenantId, JSON.stringify(batch)]);
    }
    for (const batch of chunks(flattened.leaveEvents, chunkSize)) {
      await client.query(LEAVE_INSERT_SQL, [tenantId, JSON.stringify(batch)]);
    }
    for (const batch of chunks(flattened.movementPeriods, chunkSize)) {
      await client.query(MOVEMENT_INSERT_SQL, [tenantId, JSON.stringify(batch)]);
    }
    const verified = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM grh_directory_people WHERE tenant_id = $1) AS people,
         (SELECT COUNT(*)::int FROM grh_directory_dimensions WHERE tenant_id = $1) AS dimensions,
         (SELECT COUNT(*)::int FROM grh_directory_absence_events WHERE tenant_id = $1) AS absence_events,
         (SELECT COUNT(*)::int FROM grh_directory_leave_events WHERE tenant_id = $1) AS leave_events,
         (SELECT COUNT(*)::int FROM grh_directory_movement_periods WHERE tenant_id = $1) AS movement_periods,
         (SELECT COUNT(*)::int FROM grh_directory_people
           WHERE tenant_id = $1 AND position_observation_label IS NOT NULL) AS position_observations`,
      [tenantId],
    );
    if (Number(verified.rows?.[0]?.people) !== flattened.people.length ||
        Number(verified.rows?.[0]?.dimensions) !== flattened.dimensions.length ||
        Number(verified.rows?.[0]?.absence_events) !== flattened.absenceEvents.length ||
        Number(verified.rows?.[0]?.leave_events) !== flattened.leaveEvents.length ||
        Number(verified.rows?.[0]?.movement_periods) !== flattened.movementPeriods.length ||
        Number(verified.rows?.[0]?.position_observations) !== positionObservationCount) {
      throw publicationError('GRH_DIRECTORY_PUBLICATION_COUNT_MISMATCH');
    }
    if (transactionMode === 'managed') await client.query('COMMIT');
    return Object.freeze({
      status: current ? (sameContent ? 'unchanged' : 'replaced') : 'published',
      contentSha256,
    });
  } catch (error) {
    if (transactionMode === 'managed') await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
