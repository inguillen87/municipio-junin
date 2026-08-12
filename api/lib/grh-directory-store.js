import { createHash } from 'node:crypto';

import { assertPrismaDatabaseTransport, prisma } from './db.js';
import {
  GRH_DIRECTORY_DETAIL_ABSENCE_LIMIT,
  GRH_DIRECTORY_DETAIL_LEAVE_LIMIT,
  GRH_DIRECTORY_DETAIL_MOVEMENT_LIMIT,
  GRH_DIRECTORY_EXCLUDED_FIELDS,
  GRH_DIRECTORY_SCHEMA_VERSION,
} from './grh-directory-contract.js';
import {
  isGrhDirectorySnapshotEnabled,
  loadGrhDirectorySnapshotArtifact,
} from './grh-directory-snapshot.js';

const ALLOWED_QUERY_KEYS = new Set([
  'search',
  'page',
  'limit',
  'sector',
  'costCenter',
  'organization',
  'position',
  'positionObservation',
  'category',
  'agreement',
  'hasAbsence',
  'hasLeave',
  'hasMovement',
  'legajo',
  'company',
  'cursor',
]);
const DIMENSION_FILTERS = Object.freeze({
  sector: 'sector_code',
  costCenter: 'cost_center_code',
  organization: 'organization_code',
  position: 'position_code',
  category: 'category_code',
  agreement: 'agreement_code',
});
const FACET_DIMENSIONS = Object.freeze({
  sectors: Object.freeze({ column: 'sector_code', dimension: 'sector' }),
  costCenters: Object.freeze({ column: 'cost_center_code', dimension: 'costCenter' }),
  organizations: Object.freeze({ column: 'organization_code', dimension: 'organization' }),
  positions: Object.freeze({ column: 'position_code', dimension: 'position' }),
  positionObservations: Object.freeze({ column: 'position_observation_label', dimension: null }),
  categories: Object.freeze({ column: 'category_code', dimension: 'category' }),
  agreements: Object.freeze({ column: 'agreement_code', dimension: 'agreement' }),
});
const MAX_SEARCH_TOKENS = 6;
const MAX_CURSOR_OFFSET = 1_000_000;
const CURSOR_ORDERING_VERSION = 'unicode-nfkc-es-v1';
const SOURCE_SHA256_PATTERN = /^[0-9a-f]{64}$/;

function directoryError(code, status = 503) {
  const error = new Error('El directorio GRH no esta disponible.');
  error.code = code;
  error.status = status;
  return error;
}

function scalar(value) {
  if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
    throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
  }
  return value;
}

function integer(value, { minimum = 0, maximum = 2147483647, fallback = null } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const raw = scalar(value);
  if (typeof raw === 'number' && !Number.isSafeInteger(raw)) {
    throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
  }
  const text = String(raw);
  if (!/^\d+$/.test(text)) throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
  }
  return parsed;
}

export function normalizeGrhDirectoryScopeOrganizationCodes(value) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > 512) {
    throw directoryError('GRH_DIRECTORY_SCOPE_INVALID');
  }
  const normalized = value.map(item => {
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item) || item < 0 || item > 2147483647) {
        throw directoryError('GRH_DIRECTORY_SCOPE_INVALID');
      }
      return item;
    }
    if (typeof item !== 'string' || !/^\d{1,10}$/.test(item)) {
      throw directoryError('GRH_DIRECTORY_SCOPE_INVALID');
    }
    const parsed = Number(item);
    if (!Number.isSafeInteger(parsed) || parsed > 2147483647) {
      throw directoryError('GRH_DIRECTORY_SCOPE_INVALID');
    }
    return parsed;
  });
  return Object.freeze([...new Set(normalized)].sort((left, right) => left - right));
}

const normalizeScopeOrganizationCodes = normalizeGrhDirectoryScopeOrganizationCodes;

function booleanValue(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(scalar(value)).toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
}

function searchValue(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(scalar(value)).normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (!normalized || normalized.length > 80 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
  }
  return normalized;
}

function labelFilterValue(value) {
  if (!hasValue(value)) return null;
  const normalized = String(scalar(value)).normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (!normalized || normalized.length > 200 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
  }
  return normalized;
}

function searchTokenValue(value) {
  return value.normalize('NFKC').normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function cursorValue(value) {
  if (!hasValue(value)) return null;
  const normalized = String(scalar(value)).trim();
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(normalized)) {
    throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
  }
  return normalized;
}

function queryFingerprint(parsed) {
  const canonical = {
    cursorScope: parsed.cursorScope,
    searchTokens: parsed.searchTokens,
    sector: parsed.sector,
    costCenter: parsed.costCenter,
    organization: parsed.organization,
    position: parsed.position,
    positionObservation: parsed.positionObservation,
    category: parsed.category,
    agreement: parsed.agreement,
    hasAbsence: parsed.hasAbsence,
    hasLeave: parsed.hasLeave,
    hasMovement: parsed.hasMovement,
    limit: parsed.limit,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 24);
}

export function encodeGrhDirectoryCursor(offset, parsed) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_CURSOR_OFFSET) {
    throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
  }
  return Buffer.from(JSON.stringify({ v: 1, o: offset, q: queryFingerprint(parsed) }), 'utf8')
    .toString('base64url');
}

function decodeGrhDirectoryCursor(value, parsed) {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const exact = decoded && typeof decoded === 'object' && !Array.isArray(decoded) &&
      JSON.stringify(Object.keys(decoded).sort()) === JSON.stringify(['o', 'q', 'v']);
    if (!exact || decoded.v !== 1 || decoded.q !== queryFingerprint(parsed) ||
        !Number.isSafeInteger(decoded.o) || decoded.o < 0 || decoded.o > MAX_CURSOR_OFFSET ||
        decoded.o % parsed.limit !== 0) {
      throw new Error('invalid cursor');
    }
    return decoded.o;
  } catch {
    throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
  }
}

export function parseGrhDirectoryQuery(query = {}, { cursorScope = 'materialized:unbound:unicode-nfkc-es-v1' } = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
  }
  if (typeof cursorScope !== 'string' || !/^[a-z0-9:-]{1,160}$/.test(cursorScope)) {
    throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
  }
  for (const key of Object.keys(query)) {
    if (!ALLOWED_QUERY_KEYS.has(key)) throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
  }
  const legajo = integer(query.legajo, { minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
  const company = integer(query.company, { minimum: 1 });
  if (company !== null && legajo === null) throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
  const mode = legajo === null ? 'list' : 'detail';
  if (mode === 'detail') {
    const extraDetailKeys = Object.keys(query).filter(key => !['legajo', 'company'].includes(key) && hasValue(query[key]));
    if (extraDetailKeys.length > 0) throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
  }
  const requestedCursor = mode === 'list' ? cursorValue(query.cursor) : null;
  if (requestedCursor && hasValue(query.page)) throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
  const page = mode === 'detail' ? 1 : integer(query.page, { minimum: 1, maximum: 10000, fallback: 1 });
  const limit = mode === 'detail' ? 1 : integer(query.limit, { minimum: 1, maximum: 100, fallback: 25 });
  const filters = Object.fromEntries(Object.keys(DIMENSION_FILTERS).map(name => [
    name,
    integer(query[name], { minimum: 0 }),
  ]));
  const positionObservation = mode === 'list' ? labelFilterValue(query.positionObservation) : null;
  const search = mode === 'list' ? searchValue(query.search) : null;
  const searchTokens = search
    ? [...new Set(search.split(' ').map(searchTokenValue))].sort((left, right) => left.localeCompare(right))
    : [];
  if (searchTokens.length > MAX_SEARCH_TOKENS || searchTokens.some(token => token.length > 40)) {
    throw directoryError('GRH_DIRECTORY_QUERY_INVALID', 400);
  }
  const parsed = {
    cursorScope,
    mode,
    page,
    limit,
    search,
    searchTokens,
    legajo,
    company,
    hasAbsence: mode === 'list' ? booleanValue(query.hasAbsence) : null,
    hasLeave: mode === 'list' ? booleanValue(query.hasLeave) : null,
    hasMovement: mode === 'list' ? booleanValue(query.hasMovement) : null,
    positionObservation,
    ...filters,
  };
  const offset = requestedCursor
    ? decodeGrhDirectoryCursor(requestedCursor, parsed)
    : (mode === 'detail' ? 0 : (page - 1) * limit);
  return Object.freeze({
    ...parsed,
    cursor: requestedCursor,
    offset,
    page: mode === 'list' && requestedCursor ? Math.floor(offset / limit) + 1 : page,
  });
}

function escapeLike(value) {
  return value.replace(/[\\%_]/gu, match => '\\' + match);
}

function facetExpression(scopeClause = '') {
  const pairs = Object.entries(FACET_DIMENSIONS).map(([name, spec]) => {
    if (name === 'positionObservations') {
      return `'positionObservations', COALESCE(
      (SELECT jsonb_agg(to_jsonb(facet))
         FROM (
           SELECT people.position_observation_label AS label,
                  people.position_observation_status AS status,
                  COUNT(*)::int AS count
             FROM grh_directory_people people
            WHERE people.tenant_id = $1
              ${scopeClause}
              AND people.position_observation_label IS NOT NULL
              AND people.position_observation_status IS NOT NULL
            GROUP BY people.position_observation_label, people.position_observation_status
            ORDER BY count DESC, label ASC, status ASC
         ) facet),
      '[]'::jsonb)`;
    }
    if (name === 'categories') {
      return `'categories', COALESCE(
      (SELECT jsonb_agg(to_jsonb(facet))
         FROM (
           SELECT people.agreement_code,
                  people.category_code AS code,
                  MIN(dimension.label) AS label,
                  COUNT(*)::int AS count
             FROM grh_directory_people people
             LEFT JOIN grh_directory_dimensions dimension
               ON dimension.tenant_id = people.tenant_id
              AND dimension.dimension = 'category'
              AND dimension.company_code = people.company_code
              AND dimension.scope_code = people.agreement_code
              AND dimension.code = people.category_code
            WHERE people.tenant_id = $1
              ${scopeClause}
              AND people.agreement_code IS NOT NULL
              AND people.category_code IS NOT NULL
            GROUP BY people.agreement_code, people.category_code
            ORDER BY count DESC, label ASC NULLS LAST, agreement_code ASC, code ASC
         ) facet),
      '[]'::jsonb)`;
    }
    const companyJoin = spec.dimension === 'agreement'
      ? 'dimension.company_code = 0'
      : 'dimension.company_code = people.company_code';
    return `'${name}', COALESCE(
      (SELECT jsonb_agg(to_jsonb(facet))
         FROM (
           SELECT people.${spec.column} AS code,
                  MIN(dimension.label) AS label,
                  COUNT(*)::int AS count
             FROM grh_directory_people people
             LEFT JOIN grh_directory_dimensions dimension
               ON dimension.tenant_id = people.tenant_id
              AND dimension.dimension = '${spec.dimension}'
              AND ${companyJoin}
              AND dimension.scope_code = 0
              AND dimension.code = people.${spec.column}
            WHERE people.tenant_id = $1
              ${scopeClause}
              AND people.${spec.column} IS NOT NULL
            GROUP BY people.${spec.column}
            ORDER BY count DESC, label ASC NULLS LAST, code ASC
         ) facet),
      '[]'::jsonb)`;
  });
  return `jsonb_build_object(${pairs.join(',\n      ')})`;
}

export function buildGrhDirectorySql(tenantId, parsed, { scopeOrganizationCodes = null } = {}) {
  const values = [tenantId];
  const where = ['p.tenant_id = $1'];
  const parameter = value => {
    values.push(value);
    return '$' + values.length;
  };
  const scopeParameter = scopeOrganizationCodes === null
    ? null
    : parameter(scopeOrganizationCodes);
  if (scopeParameter !== null) {
    where.push(`p.organization_code = ANY(${scopeParameter}::integer[])`);
  }
  for (const searchToken of parsed.searchTokens) {
    const nameToken = parameter('%' + escapeLike(searchToken) + '%');
    const legajoToken = parameter(escapeLike(searchToken) + '%');
    where.push(`(translate(lower(COALESCE(p.display_name, '')), 'áéíóúüñ', 'aeiouun') LIKE ${nameToken} ESCAPE '\\' OR p.legajo::text LIKE ${legajoToken} ESCAPE '\\')`);
  }
  for (const [name, column] of Object.entries(DIMENSION_FILTERS)) {
    if (parsed[name] !== null) where.push(`p.${column} = ${parameter(parsed[name])}`);
  }
  if (parsed.positionObservation) {
    where.push(`p.position_observation_label = ${parameter(parsed.positionObservation)}`);
  }
  if (parsed.hasAbsence !== null) {
    where.push(parsed.hasAbsence ? 'p.absence_event_count > 0' : 'p.absence_event_count = 0');
  }
  if (parsed.hasLeave !== null) {
    where.push(parsed.hasLeave ? 'p.leave_event_count > 0' : 'p.leave_event_count = 0');
  }
  if (parsed.hasMovement !== null) {
    where.push(parsed.hasMovement ? 'p.movement_row_count > 0' : 'p.movement_row_count = 0');
  }
  if (parsed.legajo !== null) where.push(`p.legajo = ${parameter(parsed.legajo)}`);
  if (parsed.company !== null) where.push(`p.company_code = ${parameter(parsed.company)}`);

  const internalLimit = parsed.mode === 'detail' ? 2 : parsed.limit + 1;
  const limitParameter = parameter(internalLimit);
  const offsetParameter = parameter(parsed.offset);
  const detailHistorySelect = parsed.mode === 'detail' ? `,
           (SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'date', recent_absence.event_date::text,
                  'days', recent_absence.days
                ) ORDER BY recent_absence.event_date DESC,
                           recent_absence.days DESC NULLS LAST,
                           recent_absence.event_order ASC
              ),
              '[]'::jsonb
            )
              FROM (
                SELECT absence_event.event_date,
                       absence_event.days,
                       absence_event.event_order
                  FROM grh_directory_absence_events absence_event
                 WHERE absence_event.tenant_id = p.tenant_id
                   AND absence_event.company_code = p.company_code
                   AND absence_event.legajo = p.legajo
                 ORDER BY absence_event.event_date DESC,
                          absence_event.days DESC NULLS LAST,
                          absence_event.event_order ASC
                 LIMIT ${GRH_DIRECTORY_DETAIL_ABSENCE_LIMIT}
              ) recent_absence
           ) AS absence_history,
           (SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'start_date', recent_leave.start_date::text,
                  'end_date', recent_leave.end_date::text,
                  'days', recent_leave.days
                ) ORDER BY recent_leave.start_date DESC,
                           recent_leave.end_date DESC NULLS LAST,
                           recent_leave.event_order ASC
              ),
              '[]'::jsonb
            )
              FROM (
                SELECT leave_event.start_date,
                       leave_event.end_date,
                       leave_event.days,
                       leave_event.event_order
                  FROM grh_directory_leave_events leave_event
                 WHERE leave_event.tenant_id = p.tenant_id
                   AND leave_event.company_code = p.company_code
                   AND leave_event.legajo = p.legajo
                 ORDER BY leave_event.start_date DESC,
                          leave_event.end_date DESC NULLS LAST,
                          leave_event.event_order ASC
                 LIMIT ${GRH_DIRECTORY_DETAIL_LEAVE_LIMIT}
              ) recent_leave
            ) AS leave_history,
           (SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'period', recent_movement.period,
                  'row_count', recent_movement.row_count
                ) ORDER BY recent_movement.period DESC
              ),
              '[]'::jsonb
            )
              FROM (
                SELECT movement_period.period,
                       movement_period.row_count
                  FROM grh_directory_movement_periods movement_period
                 WHERE movement_period.tenant_id = p.tenant_id
                   AND movement_period.company_code = p.company_code
                   AND movement_period.legajo = p.legajo
                 ORDER BY movement_period.period DESC
                 LIMIT ${GRH_DIRECTORY_DETAIL_MOVEMENT_LIMIT}
              ) recent_movement
           ) AS movement_history` : '';
  const facetsCte = parsed.mode === 'list'
    ? `, facets AS (SELECT ${facetExpression(
      scopeParameter === null ? '' : `AND people.organization_code = ANY(${scopeParameter}::integer[])`,
    )} AS value)`
    : '';
  const facetsSelect = parsed.mode === 'list' ? '(SELECT value FROM facets)' : 'NULL::jsonb';
  const sql = `WITH filtered AS (
    SELECT p.company_code,
           p.legajo,
           p.display_name,
           p.sector_code,
           sector.label AS sector_label,
           p.cost_center_code,
           cost_center.label AS cost_center_label,
           p.organization_code,
           organization.label AS organization_label,
           p.position_code,
           position.label AS position_label,
           position.parent_code AS position_parent_code,
           position_parent.label AS position_parent_label,
           position.depends_on_code AS position_depends_on_code,
           position_dependency.label AS position_depends_on_label,
           p.position_observation_label,
           p.position_observed_date,
           p.position_observed_period,
           p.position_observation_status,
           p.position_observation_source,
           p.category_code,
           category.label AS category_label,
           p.agreement_code,
           agreement.label AS agreement_label,
           p.absence_event_count,
           p.latest_absence_date,
           p.leave_event_count,
           p.latest_leave_start_date,
           p.latest_leave_end_date,
           p.movement_row_count,
           p.movement_period_count,
           p.latest_movement_period${detailHistorySelect}
      FROM grh_directory_people p
      LEFT JOIN grh_directory_dimensions sector
        ON sector.tenant_id = p.tenant_id
       AND sector.dimension = 'sector'
       AND sector.company_code = p.company_code
       AND sector.scope_code = 0
       AND sector.code = p.sector_code
      LEFT JOIN grh_directory_dimensions cost_center
        ON cost_center.tenant_id = p.tenant_id
       AND cost_center.dimension = 'costCenter'
       AND cost_center.company_code = p.company_code
       AND cost_center.scope_code = 0
       AND cost_center.code = p.cost_center_code
      LEFT JOIN grh_directory_dimensions organization
        ON organization.tenant_id = p.tenant_id
       AND organization.dimension = 'organization'
       AND organization.company_code = p.company_code
       AND organization.scope_code = 0
       AND organization.code = p.organization_code
      LEFT JOIN grh_directory_dimensions position
        ON position.tenant_id = p.tenant_id
       AND position.dimension = 'position'
       AND position.company_code = p.company_code
       AND position.scope_code = 0
       AND position.code = p.position_code
      LEFT JOIN grh_directory_dimensions category
        ON category.tenant_id = p.tenant_id
       AND category.dimension = 'category'
       AND category.company_code = p.company_code
       AND category.scope_code = COALESCE(p.agreement_code, 0)
       AND category.code = p.category_code
      LEFT JOIN grh_directory_dimensions position_parent
        ON position_parent.tenant_id = position.tenant_id
       AND position_parent.dimension = 'position'
       AND position_parent.company_code = position.company_code
       AND position_parent.scope_code = 0
       AND position_parent.code = position.parent_code
      LEFT JOIN grh_directory_dimensions position_dependency
        ON position_dependency.tenant_id = position.tenant_id
       AND position_dependency.dimension = 'position'
       AND position_dependency.company_code = position.company_code
       AND position_dependency.scope_code = 0
       AND position_dependency.code = position.depends_on_code
      LEFT JOIN grh_directory_dimensions agreement
        ON agreement.tenant_id = p.tenant_id
       AND agreement.dimension = 'agreement'
       AND agreement.company_code = 0
       AND agreement.scope_code = 0
       AND agreement.code = p.agreement_code
     WHERE ${where.join('\n       AND ')}
  ), page_rows AS (
    SELECT *
      FROM filtered
     ORDER BY display_name ASC NULLS LAST, legajo ASC, company_code ASC
     LIMIT ${limitParameter}
    OFFSET ${offsetParameter}
  )${facetsCte}
  SELECT source.canonical_system,
         source.source_file,
         source.source_sha256,
         source.snapshot_as_of::text,
         (SELECT COUNT(*)::int FROM filtered) AS total,
         ${facetsSelect} AS facets,
         COALESCE(
           (SELECT jsonb_agg(to_jsonb(ordered_rows))
              FROM (SELECT * FROM page_rows
                     ORDER BY display_name ASC NULLS LAST, legajo ASC, company_code ASC) ordered_rows),
           '[]'::jsonb
         ) AS items
    FROM grh_directory_sources source
   WHERE source.tenant_id = $1`;
  return Object.freeze({ sql, values: Object.freeze(values) });
}

async function defaultQuery(sql, values) {
  if (!assertPrismaDatabaseTransport()) throw directoryError('GRH_DIRECTORY_DATABASE_UNAVAILABLE');
  const rows = await prisma.$queryRawUnsafe(sql, ...values);
  return { rows };
}

function dateValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function safeInteger(value) {
  const parsed = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw directoryError('GRH_DIRECTORY_ROW_INVALID');
  return parsed;
}

function nullableSafeInteger(value) {
  return value === null || value === undefined ? null : safeInteger(value);
}

function dimension(code, label) {
  if (code === null || code === undefined) return null;
  return { code: safeInteger(code), label: label === null || label === undefined ? null : String(label) };
}

function position(row) {
  const value = dimension(row.position_code, row.position_label);
  if (!value) return null;
  return {
    ...value,
    parent: dimension(row.position_parent_code, row.position_parent_label),
    dependsOn: dimension(row.position_depends_on_code, row.position_depends_on_label),
  };
}

function positionObservation(row) {
  if (row.position_observation_label === null || row.position_observation_label === undefined) return null;
  return {
    label: String(row.position_observation_label),
    observedDate: dateValue(row.position_observed_date),
    observedPeriod: String(row.position_observed_period),
    status: String(row.position_observation_status),
    sourceTable: String(row.position_observation_source),
  };
}

function jsonValue(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw directoryError('GRH_DIRECTORY_ROW_INVALID');
  }
}

function mapLeaveHistory(row) {
  const history = jsonValue(row.leave_history);
  if (!Array.isArray(history)) throw directoryError('GRH_DIRECTORY_ROW_INVALID');
  return {
    total: safeInteger(row.leave_event_count),
    limit: GRH_DIRECTORY_DETAIL_LEAVE_LIMIT,
    items: history.map(event => ({
      startDate: dateValue(event.start_date),
      endDate: dateValue(event.end_date),
      days: nullableSafeInteger(event.days),
    })),
  };
}

function mapAbsenceHistory(row) {
  const history = jsonValue(row.absence_history);
  if (!Array.isArray(history)) throw directoryError('GRH_DIRECTORY_ROW_INVALID');
  return {
    total: safeInteger(row.absence_event_count),
    limit: GRH_DIRECTORY_DETAIL_ABSENCE_LIMIT,
    items: history.map(event => ({
      date: dateValue(event.date),
      days: nullableSafeInteger(event.days),
    })),
  };
}

function mapMovementHistory(row) {
  const history = jsonValue(row.movement_history);
  if (!Array.isArray(history)) throw directoryError('GRH_DIRECTORY_ROW_INVALID');
  return {
    total: safeInteger(row.movement_period_count),
    limit: GRH_DIRECTORY_DETAIL_MOVEMENT_LIMIT,
    items: history.map(event => ({
      period: String(event.period),
      rowCount: safeInteger(event.row_count),
    })),
  };
}

function mapItem(row, mode) {
  const item = {
    companyCode: safeInteger(row.company_code),
    legajo: safeInteger(row.legajo),
    displayName: row.display_name === null || row.display_name === undefined ? null : String(row.display_name),
    sector: dimension(row.sector_code, row.sector_label),
    costCenter: dimension(row.cost_center_code, row.cost_center_label),
    organization: dimension(row.organization_code, row.organization_label),
    position: position(row),
    positionObservation: positionObservation(row),
    category: dimension(row.category_code, row.category_label),
    agreement: dimension(row.agreement_code, row.agreement_label),
    events: {
      absenceCount: safeInteger(row.absence_event_count),
      latestAbsenceDate: dateValue(row.latest_absence_date),
      leaveCount: safeInteger(row.leave_event_count),
      latestLeaveStartDate: dateValue(row.latest_leave_start_date),
      latestLeaveEndDate: dateValue(row.latest_leave_end_date),
    },
    movement: {
      rowCount: safeInteger(row.movement_row_count),
      periodCount: safeInteger(row.movement_period_count),
      latestPeriod: row.latest_movement_period === null || row.latest_movement_period === undefined
        ? null
        : String(row.latest_movement_period),
    },
  };
  if (mode === 'detail') {
    item.absenceHistory = mapAbsenceHistory(row);
    item.leaveHistory = mapLeaveHistory(row);
    item.movementHistory = mapMovementHistory(row);
  }
  return item;
}

function mapFacets(value) {
  const raw = jsonValue(value);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw directoryError('GRH_DIRECTORY_ROW_INVALID');
  }
  return Object.fromEntries(Object.keys(FACET_DIMENSIONS).map(name => {
    const items = raw[name];
    if (!Array.isArray(items)) throw directoryError('GRH_DIRECTORY_ROW_INVALID');
    return [name, items.map(item => (
      name === 'positionObservations'
        ? {
          label: String(item.label),
          count: safeInteger(item.count),
          status: String(item.status),
        }
        : {
          ...(name === 'categories' ? {
            agreementCode: safeInteger(item.agreement_code ?? item.agreementCode),
          } : {}),
          code: safeInteger(item.code),
          label: item.label === null || item.label === undefined ? null : String(item.label),
          count: safeInteger(item.count),
        }
    ))];
  }));
}

function compareNullableLabels(left, right) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right, 'es', { sensitivity: 'variant' });
}

function minimumLabel(current, candidate) {
  if (candidate === null || candidate === undefined) return current;
  const value = String(candidate);
  if (current === null || compareNullableLabels(value, current) < 0) return value;
  return current;
}

function dimensionFacets(records, property) {
  const grouped = new Map();
  for (const record of records) {
    const dimensionValue = record[property];
    if (!dimensionValue) continue;
    const key = String(dimensionValue.code);
    const current = grouped.get(key) || { code: dimensionValue.code, label: null, count: 0 };
    current.label = minimumLabel(current.label, dimensionValue.label);
    current.count += 1;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((left, right) => (
    right.count - left.count ||
    compareNullableLabels(left.label, right.label) ||
    left.code - right.code
  ));
}

function categoryFacets(records) {
  const grouped = new Map();
  for (const record of records) {
    if (!record.agreement || !record.category) continue;
    const key = record.agreement.code + ':' + record.category.code;
    const current = grouped.get(key) || {
      agreementCode: record.agreement.code,
      code: record.category.code,
      label: null,
      count: 0,
    };
    current.label = minimumLabel(current.label, record.category.label);
    current.count += 1;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((left, right) => (
    right.count - left.count ||
    compareNullableLabels(left.label, right.label) ||
    left.agreementCode - right.agreementCode ||
    left.code - right.code
  ));
}

function positionObservationFacets(records) {
  const grouped = new Map();
  for (const record of records) {
    const observation = record.position_observation;
    if (!observation) continue;
    const key = observation.status + ':' + observation.label;
    const current = grouped.get(key) || {
      label: observation.label,
      count: 0,
      status: observation.status,
    };
    current.count += 1;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((left, right) => (
    right.count - left.count ||
    left.label.localeCompare(right.label, 'es', { sensitivity: 'variant' }) ||
    left.status.localeCompare(right.status)
  ));
}

function snapshotFacets(records) {
  return {
    sectors: dimensionFacets(records, 'sector'),
    costCenters: dimensionFacets(records, 'cost_center'),
    organizations: dimensionFacets(records, 'organization'),
    positions: dimensionFacets(records, 'position'),
    positionObservations: positionObservationFacets(records),
    categories: categoryFacets(records),
    agreements: dimensionFacets(records, 'agreement'),
  };
}

function artifactDimension(value) {
  if (!value) return null;
  return { code: value.code, label: value.label };
}

function artifactPosition(value) {
  if (!value) return null;
  return {
    code: value.code,
    label: value.label,
    parent: artifactDimension(value.parent),
    dependsOn: artifactDimension(value.depends_on),
  };
}

function artifactPositionObservation(value) {
  if (!value) return null;
  return {
    label: value.label,
    observedDate: value.observed_date,
    observedPeriod: value.observed_period,
    status: value.status,
    sourceTable: value.source_table,
  };
}

function snapshotItem(record, mode) {
  const item = {
    companyCode: record.company_code,
    legajo: record.legajo,
    displayName: record.display_name,
    sector: artifactDimension(record.sector),
    costCenter: artifactDimension(record.cost_center),
    organization: artifactDimension(record.organization),
    position: artifactPosition(record.position),
    positionObservation: artifactPositionObservation(record.position_observation),
    category: artifactDimension(record.category),
    agreement: artifactDimension(record.agreement),
    events: {
      absenceCount: record.absence.event_count,
      latestAbsenceDate: record.absence.latest_date,
      leaveCount: record.leave.event_count,
      latestLeaveStartDate: record.leave.latest_start_date,
      latestLeaveEndDate: record.leave.latest_end_date,
    },
    movement: {
      rowCount: record.movement.row_count,
      periodCount: record.movement.period_count,
      latestPeriod: record.movement.latest_period,
    },
  };
  if (mode === 'detail') {
    item.absenceHistory = {
      total: record.absence.event_count,
      limit: GRH_DIRECTORY_DETAIL_ABSENCE_LIMIT,
      items: record.absence_history.slice(0, GRH_DIRECTORY_DETAIL_ABSENCE_LIMIT).map(event => ({
        date: event.date,
        days: event.days,
      })),
    };
    item.leaveHistory = {
      total: record.leave.event_count,
      limit: GRH_DIRECTORY_DETAIL_LEAVE_LIMIT,
      items: record.leave_history.slice(0, GRH_DIRECTORY_DETAIL_LEAVE_LIMIT).map(event => ({
        startDate: event.start_date,
        endDate: event.end_date,
        days: event.days,
      })),
    };
    item.movementHistory = {
      total: record.movement.period_count,
      limit: GRH_DIRECTORY_DETAIL_MOVEMENT_LIMIT,
      items: record.movement_history.slice(0, GRH_DIRECTORY_DETAIL_MOVEMENT_LIMIT).map(event => ({
        period: event.period,
        rowCount: event.row_count,
      })),
    };
  }
  return item;
}

function snapshotRecordOrder(left, right) {
  if (left.display_name === null && right.display_name !== null) return 1;
  if (left.display_name !== null && right.display_name === null) return -1;
  if (left.display_name !== null && right.display_name !== null) {
    const byName = left.display_name.localeCompare(right.display_name, 'es', { sensitivity: 'variant' });
    if (byName) return byName;
  }
  return left.legajo - right.legajo || left.company_code - right.company_code;
}

function snapshotRecordMatches(record, parsed) {
  const searchableName = record.display_name ? searchTokenValue(record.display_name) : '';
  const legajo = String(record.legajo);
  if (!parsed.searchTokens.every(token => searchableName.includes(token) || legajo.startsWith(token))) return false;
  for (const name of Object.keys(DIMENSION_FILTERS)) {
    const artifactName = name === 'costCenter' ? 'cost_center' : name;
    if (parsed[name] !== null && record[artifactName]?.code !== parsed[name]) return false;
  }
  if (parsed.positionObservation !== null &&
      record.position_observation?.label?.normalize('NFKC') !== parsed.positionObservation) return false;
  if (parsed.hasAbsence !== null && (record.absence.event_count > 0) !== parsed.hasAbsence) return false;
  if (parsed.hasLeave !== null && (record.leave.event_count > 0) !== parsed.hasLeave) return false;
  if (parsed.hasMovement !== null && (record.movement.row_count > 0) !== parsed.hasMovement) return false;
  if (parsed.legajo !== null && record.legajo !== parsed.legajo) return false;
  if (parsed.company !== null && record.company_code !== parsed.company) return false;
  return true;
}

function responseFromSnapshot(artifact, parsed, scopeOrganizationCodes = null) {
  const scope = scopeOrganizationCodes === null ? null : new Set(scopeOrganizationCodes);
  const scopedRecords = scope === null
    ? artifact.records
    : artifact.records.filter(record => record.organization && scope.has(record.organization.code));
  const filtered = scopedRecords.filter(record => snapshotRecordMatches(record, parsed));
  if (parsed.mode === 'list') filtered.sort(snapshotRecordOrder);
  const total = filtered.length;
  if (parsed.mode === 'detail' && total === 0) throw directoryError('GRH_DIRECTORY_NOT_FOUND', 404);
  if (parsed.mode === 'detail' && total > 1 && parsed.company === null) {
    throw directoryError('GRH_DIRECTORY_LEGAJO_AMBIGUOUS', 409);
  }
  const rawItems = parsed.mode === 'detail'
    ? filtered.slice(0, 1)
    : filtered.slice(parsed.offset, parsed.offset + parsed.limit + 1);
  const hasNext = parsed.mode === 'list' && rawItems.length > parsed.limit;
  const items = rawItems.slice(0, parsed.limit).map(record => snapshotItem(record, parsed.mode));
  return {
    schemaVersion: GRH_DIRECTORY_SCHEMA_VERSION,
    source: {
      canonicalSystem: artifact.source.canonical_system,
      sourceFile: artifact.source.file,
      sourceSha256: artifact.source.sha256,
      snapshotAsOf: artifact.source.snapshot_as_of,
    },
    privacy: {
      containsPersonalData: true,
      excludedFields: [...GRH_DIRECTORY_EXCLUDED_FIELDS],
    },
    query: {
      mode: parsed.mode,
      page: parsed.page,
      limit: parsed.limit,
      total,
      hasNext,
      cursor: parsed.cursor,
      nextCursor: hasNext ? encodeGrhDirectoryCursor(parsed.offset + parsed.limit, parsed) : null,
    },
    facets: parsed.mode === 'list' ? snapshotFacets(scopedRecords) : null,
    items,
  };
}

export async function readGrhDirectory({
  tenantId,
  query = {},
  scopeOrganizationCodes = null,
  queryImpl = defaultQuery,
  environment = process.env,
} = {}) {
  if (typeof tenantId !== 'string' || !tenantId) throw directoryError('GRH_DIRECTORY_TENANT_REQUIRED');
  const normalizedScope = normalizeScopeOrganizationCodes(scopeOrganizationCodes);
  const snapshotEnabled = isGrhDirectorySnapshotEnabled(environment);
  const configuredSourceSha = SOURCE_SHA256_PATTERN.test(environment?.GRH_SOURCE_SHA256 || '')
    ? environment.GRH_SOURCE_SHA256
    : null;
  const cursorScope = [
    snapshotEnabled ? 'snapshot' : 'materialized',
    configuredSourceSha || 'unbound',
    CURSOR_ORDERING_VERSION,
    normalizedScope === null
      ? 'tenant'
      : createHash('sha256').update(normalizedScope.join(',')).digest('hex').slice(0, 16),
  ].join(':');
  const parsed = parseGrhDirectoryQuery(query, { cursorScope });
  if (normalizedScope !== null && parsed.organization !== null && !normalizedScope.includes(parsed.organization)) {
    throw directoryError('GRH_DIRECTORY_SCOPE_DENIED', 403);
  }
  if (snapshotEnabled) {
    const artifact = await loadGrhDirectorySnapshotArtifact({
      tenantId,
      key: environment.GRH_DIRECTORY_SNAPSHOT_KEY_V1,
      queryImpl,
    });
    if (configuredSourceSha && artifact.source.sha256 !== configuredSourceSha) {
      throw directoryError('GRH_DIRECTORY_SOURCE_MISMATCH');
    }
    return responseFromSnapshot(artifact, parsed, normalizedScope);
  }
  const built = buildGrhDirectorySql(tenantId, parsed, { scopeOrganizationCodes: normalizedScope });
  const result = await queryImpl(built.sql, built.values);
  const source = result?.rows?.[0];
  if (!source) throw directoryError('GRH_DIRECTORY_SOURCE_UNAVAILABLE');
  if (configuredSourceSha && String(source.source_sha256) !== configuredSourceSha) {
    throw directoryError('GRH_DIRECTORY_SOURCE_MISMATCH');
  }
  let rawItems = source.items;
  if (typeof rawItems === 'string') rawItems = JSON.parse(rawItems);
  if (!Array.isArray(rawItems)) throw directoryError('GRH_DIRECTORY_ROW_INVALID');
  const total = safeInteger(source.total);
  if (parsed.mode === 'detail' && total === 0) throw directoryError('GRH_DIRECTORY_NOT_FOUND', 404);
  if (parsed.mode === 'detail' && total > 1 && parsed.company === null) {
    throw directoryError('GRH_DIRECTORY_LEGAJO_AMBIGUOUS', 409);
  }
  const hasNext = parsed.mode === 'list' && rawItems.length > parsed.limit;
  const items = rawItems.slice(0, parsed.limit).map(row => mapItem(row, parsed.mode));
  const nextCursor = hasNext
    ? encodeGrhDirectoryCursor(parsed.offset + parsed.limit, parsed)
    : null;
  return {
    schemaVersion: GRH_DIRECTORY_SCHEMA_VERSION,
    source: {
      canonicalSystem: String(source.canonical_system),
      sourceFile: String(source.source_file),
      sourceSha256: String(source.source_sha256),
      snapshotAsOf: dateValue(source.snapshot_as_of),
    },
    privacy: {
      containsPersonalData: true,
      excludedFields: [...GRH_DIRECTORY_EXCLUDED_FIELDS],
    },
    query: {
      mode: parsed.mode,
      page: parsed.page,
      limit: parsed.limit,
      total,
      hasNext,
      cursor: parsed.cursor,
      nextCursor,
    },
    facets: parsed.mode === 'list' ? mapFacets(source.facets) : null,
    items,
  };
}
