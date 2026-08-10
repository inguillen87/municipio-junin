import { createHash } from 'node:crypto';

import { assertPrismaDatabaseTransport, prisma } from './db.js';
import {
  GRH_DIRECTORY_DETAIL_LEAVE_LIMIT,
  GRH_DIRECTORY_EXCLUDED_FIELDS,
  GRH_DIRECTORY_SCHEMA_VERSION,
} from './grh-directory-contract.js';

const ALLOWED_QUERY_KEYS = new Set([
  'search',
  'page',
  'limit',
  'sector',
  'organization',
  'position',
  'positionObservation',
  'category',
  'agreement',
  'hasAbsence',
  'hasLeave',
  'legajo',
  'company',
  'cursor',
]);
const DIMENSION_FILTERS = Object.freeze({
  sector: 'sector_code',
  organization: 'organization_code',
  position: 'position_code',
  category: 'category_code',
  agreement: 'agreement_code',
});
const FACET_DIMENSIONS = Object.freeze({
  sectors: Object.freeze({ column: 'sector_code', dimension: 'sector' }),
  organizations: Object.freeze({ column: 'organization_code', dimension: 'organization' }),
  positions: Object.freeze({ column: 'position_code', dimension: 'position' }),
  positionObservations: Object.freeze({ column: 'position_observation_label', dimension: null }),
  categories: Object.freeze({ column: 'category_code', dimension: 'category' }),
  agreements: Object.freeze({ column: 'agreement_code', dimension: 'agreement' }),
});
const MAX_SEARCH_TOKENS = 6;
const MAX_CURSOR_OFFSET = 1_000_000;

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
  return value.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
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
    searchTokens: parsed.searchTokens,
    sector: parsed.sector,
    organization: parsed.organization,
    position: parsed.position,
    positionObservation: parsed.positionObservation,
    category: parsed.category,
    agreement: parsed.agreement,
    hasAbsence: parsed.hasAbsence,
    hasLeave: parsed.hasLeave,
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

export function parseGrhDirectoryQuery(query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
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
    mode,
    page,
    limit,
    search,
    searchTokens,
    legajo,
    company,
    hasAbsence: mode === 'list' ? booleanValue(query.hasAbsence) : null,
    hasLeave: mode === 'list' ? booleanValue(query.hasLeave) : null,
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

function facetExpression() {
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
              AND people.${spec.column} IS NOT NULL
            GROUP BY people.${spec.column}
            ORDER BY count DESC, label ASC NULLS LAST, code ASC
         ) facet),
      '[]'::jsonb)`;
  });
  return `jsonb_build_object(${pairs.join(',\n      ')})`;
}

export function buildGrhDirectorySql(tenantId, parsed) {
  const values = [tenantId];
  const where = ['p.tenant_id = $1'];
  const parameter = value => {
    values.push(value);
    return '$' + values.length;
  };
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
  if (parsed.legajo !== null) where.push(`p.legajo = ${parameter(parsed.legajo)}`);
  if (parsed.company !== null) where.push(`p.company_code = ${parameter(parsed.company)}`);

  const internalLimit = parsed.mode === 'detail' ? 2 : parsed.limit + 1;
  const limitParameter = parameter(internalLimit);
  const offsetParameter = parameter(parsed.offset);
  const leaveHistorySelect = parsed.mode === 'detail' ? `,
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
           ) AS leave_history` : '';
  const facetsCte = parsed.mode === 'list'
    ? `, facets AS (SELECT ${facetExpression()} AS value)`
    : '';
  const facetsSelect = parsed.mode === 'list' ? '(SELECT value FROM facets)' : 'NULL::jsonb';
  const sql = `WITH filtered AS (
    SELECT p.company_code,
           p.legajo,
           p.display_name,
           p.sector_code,
           sector.label AS sector_label,
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
           p.latest_leave_end_date${leaveHistorySelect}
      FROM grh_directory_people p
      LEFT JOIN grh_directory_dimensions sector
        ON sector.tenant_id = p.tenant_id
       AND sector.dimension = 'sector'
       AND sector.company_code = p.company_code
       AND sector.scope_code = 0
       AND sector.code = p.sector_code
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

function mapItem(row, mode) {
  const item = {
    companyCode: safeInteger(row.company_code),
    legajo: safeInteger(row.legajo),
    displayName: row.display_name === null || row.display_name === undefined ? null : String(row.display_name),
    sector: dimension(row.sector_code, row.sector_label),
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
  };
  if (mode === 'detail') item.leaveHistory = mapLeaveHistory(row);
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

export async function readGrhDirectory({ tenantId, query = {}, queryImpl = defaultQuery } = {}) {
  if (typeof tenantId !== 'string' || !tenantId) throw directoryError('GRH_DIRECTORY_TENANT_REQUIRED');
  const parsed = parseGrhDirectoryQuery(query);
  const built = buildGrhDirectorySql(tenantId, parsed);
  const result = await queryImpl(built.sql, built.values);
  const source = result?.rows?.[0];
  if (!source) throw directoryError('GRH_DIRECTORY_SOURCE_UNAVAILABLE');
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
