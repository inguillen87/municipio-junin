const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const GRH_DIRECTORY_SCHEMA_VERSION = 'grh-directory-v2';
export const GRH_DIRECTORY_DETAIL_ABSENCE_LIMIT = 24;
export const GRH_DIRECTORY_DETAIL_LEAVE_LIMIT = 24;
export const GRH_DIRECTORY_DETAIL_MOVEMENT_LIMIT = 24;
export const GRH_DIRECTORY_EXCLUDED_FIELDS = Object.freeze([
  'dni',
  'cuil',
  'contact',
  'address',
  'bank_account',
  'salary',
  'event_cause',
]);

const ARTIFACT_KEYS = Object.freeze(['schema_version', 'source', 'privacy', 'counts', 'records']);
const ARTIFACT_SOURCE_KEYS = Object.freeze([
  'canonical_system',
  'file',
  'sha256',
  'compressed_size_bytes',
  'snapshot_as_of',
  'generated_at',
]);
const ARTIFACT_PRIVACY_KEYS = Object.freeze([
  'contains_personal_data',
  'private_storage_required',
  'excluded_fields',
]);
const SOURCE_ROW_TABLES = Object.freeze([
  'ausencia',
  'cargo',
  'catego',
  'convenio',
  'costos',
  'histolegajo',
  'legajo',
  'legamov',
  'licencia',
  'organiza',
  'persona',
  'sectores',
]);
const ARTIFACT_COUNT_KEYS = Object.freeze([
  'source_rows',
  'directory_records',
  'person_matches',
  'records_with_name',
  'records_without_name',
  'duplicate_person_links',
  'invalid_employee_key_rows',
  'valid_absence_events',
  'quarantined_absence_events',
  'valid_leave_events',
  'quarantined_leave_events',
  'valid_movement_rows',
  'quarantined_movement_rows',
  'valid_position_observation_rows',
  'blank_position_observation_rows',
  'quarantined_position_observation_rows',
  'future_effective_position_observation_rows',
  'records_with_position_observation',
]);
const ARTIFACT_RECORD_KEYS = Object.freeze([
  'company_code',
  'legajo',
  'display_name',
  'sector',
  'cost_center',
  'organization',
  'position',
  'category',
  'agreement',
  'absence',
  'absence_history',
  'leave',
  'leave_history',
  'movement',
  'movement_history',
  'position_observation',
]);
const DIMENSION_KEYS = Object.freeze(['code', 'label']);
const POSITION_KEYS = Object.freeze(['code', 'label', 'parent', 'depends_on']);
const POSITION_RELATION_KEYS = Object.freeze(['code', 'label']);
const ABSENCE_KEYS = Object.freeze(['event_count', 'latest_date']);
const ARTIFACT_ABSENCE_HISTORY_KEYS = Object.freeze(['date', 'days']);
const LEAVE_KEYS = Object.freeze(['event_count', 'latest_start_date', 'latest_end_date']);
const ARTIFACT_LEAVE_HISTORY_KEYS = Object.freeze(['start_date', 'end_date', 'days']);
const MOVEMENT_KEYS = Object.freeze(['row_count', 'period_count', 'latest_period']);
const ARTIFACT_MOVEMENT_HISTORY_KEYS = Object.freeze(['period', 'row_count']);
const ARTIFACT_POSITION_OBSERVATION_KEYS = Object.freeze([
  'label',
  'observed_date',
  'observed_period',
  'status',
  'source_table',
]);
const POSITION_OBSERVATION_STATUSES = new Set(['historical_observation', 'source_future_effective']);
const PERIOD_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;

const API_KEYS = Object.freeze(['schemaVersion', 'source', 'privacy', 'query', 'facets', 'items']);
const API_SOURCE_KEYS = Object.freeze([
  'canonicalSystem',
  'sourceFile',
  'sourceSha256',
  'snapshotAsOf',
]);
const API_PRIVACY_KEYS = Object.freeze(['containsPersonalData', 'excludedFields']);
const API_QUERY_KEYS = Object.freeze([
  'mode',
  'page',
  'limit',
  'total',
  'hasNext',
  'cursor',
  'nextCursor',
]);
const API_ITEM_KEYS = Object.freeze([
  'companyCode',
  'legajo',
  'displayName',
  'sector',
  'costCenter',
  'organization',
  'position',
  'positionObservation',
  'category',
  'agreement',
  'events',
  'movement',
]);
const API_DETAIL_ITEM_KEYS = Object.freeze([
  ...API_ITEM_KEYS,
  'absenceHistory',
  'leaveHistory',
  'movementHistory',
]);
const API_EVENT_KEYS = Object.freeze([
  'absenceCount',
  'latestAbsenceDate',
  'leaveCount',
  'latestLeaveStartDate',
  'latestLeaveEndDate',
]);
const API_POSITION_KEYS = Object.freeze(['code', 'label', 'parent', 'dependsOn']);
const API_POSITION_RELATION_KEYS = Object.freeze(['code', 'label']);
const API_POSITION_OBSERVATION_KEYS = Object.freeze([
  'label',
  'observedDate',
  'observedPeriod',
  'status',
  'sourceTable',
]);
const API_FACET_KEYS = Object.freeze([
  'sectors',
  'costCenters',
  'organizations',
  'positions',
  'positionObservations',
  'categories',
  'agreements',
]);
const API_FACET_ITEM_KEYS = Object.freeze(['code', 'label', 'count']);
const API_CATEGORY_FACET_ITEM_KEYS = Object.freeze(['agreementCode', 'code', 'label', 'count']);
const API_POSITION_OBSERVATION_FACET_KEYS = Object.freeze(['label', 'count', 'status']);
const API_LEAVE_HISTORY_KEYS = Object.freeze(['total', 'limit', 'items']);
const API_LEAVE_HISTORY_ITEM_KEYS = Object.freeze(['startDate', 'endDate', 'days']);
const API_ABSENCE_HISTORY_KEYS = Object.freeze(['total', 'limit', 'items']);
const API_ABSENCE_HISTORY_ITEM_KEYS = Object.freeze(['date', 'days']);
const API_MOVEMENT_KEYS = Object.freeze(['rowCount', 'periodCount', 'latestPeriod']);
const API_MOVEMENT_HISTORY_KEYS = Object.freeze(['total', 'limit', 'items']);
const API_MOVEMENT_HISTORY_ITEM_KEYS = Object.freeze(['period', 'rowCount']);

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expected.length &&
    keys.every((key, index) => key === [...expected].sort()[index]);
}

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nullableDate(value) {
  return value === null || (typeof value === 'string' && DATE_PATTERN.test(value));
}

function nullableLabel(value) {
  return value === null || (
    typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function nullableNonNegativeInteger(value) {
  return value === null || nonNegativeInteger(value);
}

function validateDimension(value, path, errors) {
  if (value === null) return;
  add(errors, exactKeys(value, DIMENSION_KEYS), path + '.shape');
  add(errors, nonNegativeInteger(value?.code), path + '.code');
  add(errors, nullableLabel(value?.label), path + '.label');
}

function validatePositionRelation(value, path, errors) {
  if (value === null) return;
  add(errors, exactKeys(value, POSITION_RELATION_KEYS), path + '.shape');
  add(errors, positiveInteger(value?.code), path + '.code');
  add(errors, nullableLabel(value?.label), path + '.label');
}

function validatePosition(value, path, errors) {
  if (value === null) return;
  add(errors, exactKeys(value, POSITION_KEYS), path + '.shape');
  add(errors, nonNegativeInteger(value?.code), path + '.code');
  add(errors, nullableLabel(value?.label), path + '.label');
  validatePositionRelation(value?.parent, path + '.parent', errors);
  validatePositionRelation(value?.depends_on, path + '.depends_on', errors);
}

function validateArtifactPositionObservation(value, path, snapshotAsOf, errors) {
  if (value === null) return;
  add(errors, exactKeys(value, ARTIFACT_POSITION_OBSERVATION_KEYS), path + '.shape');
  add(errors, nullableLabel(value?.label) && value?.label !== null, path + '.label');
  add(errors, typeof value?.observed_date === 'string' && DATE_PATTERN.test(value.observed_date),
    path + '.observed_date');
  add(errors, typeof value?.observed_period === 'string' && PERIOD_PATTERN.test(value.observed_period),
    path + '.observed_period');
  add(errors, POSITION_OBSERVATION_STATUSES.has(value?.status), path + '.status');
  add(errors, value?.source_table === 'histolegajo', path + '.source_table');
  add(errors,
    !value?.observed_date || !value?.observed_period || value.observed_date.slice(0, 7) === value.observed_period,
    path + '.period_identity');
  add(errors,
    value?.status !== 'source_future_effective' || value?.observed_date > snapshotAsOf,
    path + '.future_status_identity');
  add(errors,
    value?.status !== 'historical_observation' || value?.observed_date <= snapshotAsOf,
    path + '.historical_status_identity');
}

function artifactAbsenceHistoryErrors(events, path, snapshotAsOf) {
  const errors = [];
  add(errors, Array.isArray(events), path + '.array');
  if (!Array.isArray(events)) return errors;
  let previous = null;
  events.forEach((event, index) => {
    const itemPath = path + '.' + index;
    add(errors, exactKeys(event, ARTIFACT_ABSENCE_HISTORY_KEYS), itemPath + '.shape');
    add(errors, typeof event?.date === 'string' && DATE_PATTERN.test(event.date), itemPath + '.date');
    add(errors, nullableNonNegativeInteger(event?.days), itemPath + '.days');
    add(errors, !event?.date || event.date <= snapshotAsOf, itemPath + '.after_snapshot');
    const key = [event?.date || '', String(event?.days ?? -1)].join(':');
    add(errors, previous === null || previous.localeCompare(key, 'en', { numeric: true }) >= 0,
      path + '.deterministic_order');
    previous = key;
  });
  return errors;
}

function artifactLeaveHistoryErrors(events, path, snapshotAsOf) {
  const errors = [];
  add(errors, Array.isArray(events), path + '.array');
  if (!Array.isArray(events)) return errors;
  let previous = null;
  events.forEach((event, index) => {
    const itemPath = path + '.' + index;
    add(errors, exactKeys(event, ARTIFACT_LEAVE_HISTORY_KEYS), itemPath + '.shape');
    add(errors, typeof event?.start_date === 'string' && DATE_PATTERN.test(event.start_date),
      itemPath + '.start_date');
    add(errors, nullableDate(event?.end_date), itemPath + '.end_date');
    add(errors, nullableNonNegativeInteger(event?.days), itemPath + '.days');
    add(errors, !event?.start_date || event.start_date <= snapshotAsOf, itemPath + '.after_snapshot');
    add(errors, event?.end_date === null || event?.end_date <= snapshotAsOf, itemPath + '.end_after_snapshot');
    add(errors, event?.end_date === null || !event?.start_date || event.end_date >= event.start_date,
      itemPath + '.end_before_start');
    const key = [event?.start_date || '', event?.end_date || '', String(event?.days ?? -1)].join(':');
    add(errors, previous === null || previous.localeCompare(key, 'en', { numeric: true }) >= 0,
      path + '.deterministic_order');
    previous = key;
  });
  return errors;
}

function artifactMovementHistoryErrors(events, path, snapshotAsOf) {
  const errors = [];
  add(errors, Array.isArray(events), path + '.array');
  if (!Array.isArray(events)) return errors;
  let previous = null;
  const seen = new Set();
  events.forEach((event, index) => {
    const itemPath = path + '.' + index;
    add(errors, exactKeys(event, ARTIFACT_MOVEMENT_HISTORY_KEYS), itemPath + '.shape');
    add(errors, typeof event?.period === 'string' && PERIOD_PATTERN.test(event.period), itemPath + '.period');
    add(errors, positiveInteger(event?.row_count), itemPath + '.row_count');
    add(errors, !event?.period || event.period <= snapshotAsOf.slice(0, 7), itemPath + '.after_snapshot');
    add(errors, !seen.has(event?.period), itemPath + '.unique_period');
    seen.add(event?.period);
    add(errors, previous === null || previous > event?.period, path + '.deterministic_order');
    previous = event?.period;
  });
  return errors;
}

function artifactRecordErrors(record, index, snapshotAsOf) {
  const path = 'records.' + index;
  const errors = [];
  add(errors, exactKeys(record, ARTIFACT_RECORD_KEYS), path + '.shape');
  add(errors, positiveInteger(record?.company_code), path + '.company_code');
  add(errors, positiveInteger(record?.legajo), path + '.legajo');
  add(errors, nullableLabel(record?.display_name), path + '.display_name');
  for (const name of ['sector', 'cost_center', 'organization', 'category', 'agreement']) {
    validateDimension(record?.[name], path + '.' + name, errors);
  }
  validatePosition(record?.position, path + '.position', errors);
  validateArtifactPositionObservation(
    record?.position_observation,
    path + '.position_observation',
    snapshotAsOf,
    errors,
  );
  add(errors, exactKeys(record?.absence, ABSENCE_KEYS), path + '.absence.shape');
  add(errors, nonNegativeInteger(record?.absence?.event_count), path + '.absence.count');
  add(errors, nullableDate(record?.absence?.latest_date), path + '.absence.latest_date');
  add(errors,
    record?.absence?.latest_date == null || record?.absence?.latest_date <= snapshotAsOf,
    path + '.absence.after_snapshot');
  add(errors,
    (record?.absence?.event_count === 0) === (record?.absence?.latest_date === null),
    path + '.absence.latest_identity');
  errors.push(...artifactAbsenceHistoryErrors(
    record?.absence_history,
    path + '.absence_history',
    snapshotAsOf,
  ));
  const absenceHistory = Array.isArray(record?.absence_history) ? record.absence_history : [];
  add(errors, absenceHistory.length === record?.absence?.event_count,
    path + '.absence_history.count_identity');
  add(errors,
    absenceHistory.length === 0 || absenceHistory[0]?.date === record?.absence?.latest_date,
    path + '.absence_history.latest_identity');
  add(errors, exactKeys(record?.leave, LEAVE_KEYS), path + '.leave.shape');
  add(errors, nonNegativeInteger(record?.leave?.event_count), path + '.leave.count');
  add(errors, nullableDate(record?.leave?.latest_start_date), path + '.leave.latest_start');
  add(errors, nullableDate(record?.leave?.latest_end_date), path + '.leave.latest_end');
  add(errors,
    record?.leave?.latest_start_date == null || record?.leave?.latest_start_date <= snapshotAsOf,
    path + '.leave.start_after_snapshot');
  add(errors,
    record?.leave?.latest_end_date == null || record?.leave?.latest_end_date <= snapshotAsOf,
    path + '.leave.end_after_snapshot');
  add(errors,
    record?.leave?.latest_start_date === null || record?.leave?.latest_end_date === null ||
      record?.leave?.latest_end_date >= record?.leave?.latest_start_date,
    path + '.leave.end_before_start');
  errors.push(...artifactLeaveHistoryErrors(record?.leave_history, path + '.leave_history', snapshotAsOf));
  const leaveHistory = Array.isArray(record?.leave_history) ? record.leave_history : [];
  add(errors, leaveHistory.length === record?.leave?.event_count, path + '.leave_history.count_identity');
  add(errors,
    leaveHistory.length === 0 || leaveHistory[0]?.start_date === record?.leave?.latest_start_date,
    path + '.leave_history.latest_start_identity');
  add(errors,
    leaveHistory.length === 0 || leaveHistory[0]?.end_date === record?.leave?.latest_end_date,
    path + '.leave_history.latest_end_identity');
  add(errors, exactKeys(record?.movement, MOVEMENT_KEYS), path + '.movement.shape');
  add(errors, nonNegativeInteger(record?.movement?.row_count), path + '.movement.row_count');
  add(errors, nonNegativeInteger(record?.movement?.period_count), path + '.movement.period_count');
  add(errors,
    record?.movement?.latest_period == null || (
      typeof record?.movement?.latest_period === 'string' && PERIOD_PATTERN.test(record.movement.latest_period)
    ),
    path + '.movement.latest_period');
  add(errors,
    record?.movement?.latest_period == null || record?.movement?.latest_period <= snapshotAsOf.slice(0, 7),
    path + '.movement.after_snapshot');
  errors.push(...artifactMovementHistoryErrors(
    record?.movement_history,
    path + '.movement_history',
    snapshotAsOf,
  ));
  const movementHistory = Array.isArray(record?.movement_history) ? record.movement_history : [];
  const movementRows = movementHistory.reduce(
    (total, event) => total + (positiveInteger(event?.row_count) ? event.row_count : 0),
    0,
  );
  add(errors, movementHistory.length === record?.movement?.period_count,
    path + '.movement_history.period_count_identity');
  add(errors, movementRows === record?.movement?.row_count,
    path + '.movement_history.row_count_identity');
  add(errors,
    movementHistory.length === 0 || movementHistory[0]?.period === record?.movement?.latest_period,
    path + '.movement_history.latest_identity');
  add(errors,
    (movementHistory.length === 0) === (record?.movement?.latest_period === null),
    path + '.movement_history.empty_identity');
  return errors;
}

export function inspectGrhDirectoryArtifact(value) {
  const errors = [];
  add(errors, exactKeys(value, ARTIFACT_KEYS), 'artifact.shape');
  add(errors, value?.schema_version === GRH_DIRECTORY_SCHEMA_VERSION, 'artifact.schema_version');
  add(errors, exactKeys(value?.source, ARTIFACT_SOURCE_KEYS), 'source.shape');
  add(errors, typeof value?.source?.canonical_system === 'string' && value.source.canonical_system.length > 0,
    'source.canonical_system');
  add(errors, typeof value?.source?.file === 'string' && value.source.file.endsWith('.sql.gz'), 'source.file');
  add(errors, SHA256_PATTERN.test(value?.source?.sha256 || ''), 'source.sha256');
  add(errors, positiveInteger(value?.source?.compressed_size_bytes), 'source.compressed_size');
  add(errors, DATE_PATTERN.test(value?.source?.snapshot_as_of || ''), 'source.snapshot');
  add(errors, TIMESTAMP_PATTERN.test(value?.source?.generated_at || ''), 'source.generated_at');
  add(errors, exactKeys(value?.privacy, ARTIFACT_PRIVACY_KEYS), 'privacy.shape');
  add(errors, value?.privacy?.contains_personal_data === true, 'privacy.personal_data');
  add(errors, value?.privacy?.private_storage_required === true, 'privacy.private_storage');
  add(errors,
    JSON.stringify(value?.privacy?.excluded_fields) === JSON.stringify(GRH_DIRECTORY_EXCLUDED_FIELDS),
    'privacy.excluded_fields');
  add(errors, exactKeys(value?.counts, ARTIFACT_COUNT_KEYS), 'counts.shape');
  add(errors, exactKeys(value?.counts?.source_rows, SOURCE_ROW_TABLES), 'counts.source_rows.shape');
  for (const table of SOURCE_ROW_TABLES) {
    add(errors, nonNegativeInteger(value?.counts?.source_rows?.[table]), 'counts.source_rows.' + table);
  }
  for (const key of ARTIFACT_COUNT_KEYS.filter(key => key !== 'source_rows')) {
    add(errors, nonNegativeInteger(value?.counts?.[key]), 'counts.' + key);
  }
  add(errors, Array.isArray(value?.records), 'records.array');
  const records = Array.isArray(value?.records) ? value.records : [];
  add(errors, value?.counts?.directory_records === records.length, 'counts.directory_records_identity');
  add(errors,
    value?.counts?.records_with_name + value?.counts?.records_without_name === records.length,
    'counts.name_identity');
  add(errors, value?.counts?.person_matches <= value?.counts?.records_with_name, 'counts.person_match_bound');
  add(errors, records.length === 0 || value?.counts?.person_matches > 0, 'counts.person_join_required');
  add(errors, value?.counts?.duplicate_person_links === 0, 'counts.person_join_ambiguous');
  add(errors, value?.counts?.source_rows?.legajo >= records.length, 'counts.legajo_bound');
  add(errors,
    value?.counts?.directory_records + value?.counts?.invalid_employee_key_rows ===
      value?.counts?.source_rows?.legajo,
    'counts.legajo_key_identity');
  add(errors,
    value?.counts?.valid_position_observation_rows +
      value?.counts?.blank_position_observation_rows +
      value?.counts?.quarantined_position_observation_rows === value?.counts?.source_rows?.histolegajo,
    'counts.position_observation_source_identity');
  add(errors,
    value?.counts?.future_effective_position_observation_rows <=
      value?.counts?.valid_position_observation_rows,
    'counts.position_observation_future_bound');
  add(errors,
    value?.counts?.valid_absence_events + value?.counts?.quarantined_absence_events ===
      value?.counts?.source_rows?.ausencia,
    'counts.absence_source_identity');
  add(errors,
    value?.counts?.valid_leave_events + value?.counts?.quarantined_leave_events ===
      value?.counts?.source_rows?.licencia,
    'counts.leave_source_identity');
  add(errors,
    value?.counts?.valid_movement_rows + value?.counts?.quarantined_movement_rows ===
      value?.counts?.source_rows?.legamov,
    'counts.movement_source_identity');

  let previousKey = null;
  const seen = new Set();
  const snapshotAsOf = value?.source?.snapshot_as_of || '';
  let names = 0;
  let absenceEvents = 0;
  let leaveEvents = 0;
  let movementRows = 0;
  let positionObservations = 0;
  records.forEach((record, index) => {
    errors.push(...artifactRecordErrors(record, index, snapshotAsOf));
    const key = String(record?.company_code) + ':' + String(record?.legajo);
    add(errors, !seen.has(key), 'records.unique_key');
    seen.add(key);
    add(errors, previousKey === null || previousKey.localeCompare(key, 'en', { numeric: true }) < 0,
      'records.deterministic_order');
    previousKey = key;
    if (record?.display_name) names += 1;
    if (nonNegativeInteger(record?.absence?.event_count)) absenceEvents += record.absence.event_count;
    if (nonNegativeInteger(record?.leave?.event_count)) leaveEvents += record.leave.event_count;
    if (nonNegativeInteger(record?.movement?.row_count)) movementRows += record.movement.row_count;
    if (record?.position_observation) positionObservations += 1;
  });
  add(errors, names === value?.counts?.records_with_name, 'counts.records_with_name_identity');
  add(errors, absenceEvents <= value?.counts?.valid_absence_events, 'counts.absence_bound');
  add(errors, leaveEvents <= value?.counts?.valid_leave_events, 'counts.leave_bound');
  add(errors, movementRows <= value?.counts?.valid_movement_rows, 'counts.movement_bound');
  add(errors,
    positionObservations === value?.counts?.records_with_position_observation,
    'counts.position_observation_record_identity');
  add(errors,
    positionObservations <= value?.counts?.valid_position_observation_rows,
    'counts.position_observation_bound');
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)]) });
}

function apiDimensionErrors(value, path) {
  const errors = [];
  if (value === null) return errors;
  add(errors, exactKeys(value, DIMENSION_KEYS), path + '.shape');
  add(errors, nonNegativeInteger(value?.code), path + '.code');
  add(errors, nullableLabel(value?.label), path + '.label');
  return errors;
}

function apiPositionRelationErrors(value, path) {
  const errors = [];
  if (value === null) return errors;
  add(errors, exactKeys(value, API_POSITION_RELATION_KEYS), path + '.shape');
  add(errors, positiveInteger(value?.code), path + '.code');
  add(errors, nullableLabel(value?.label), path + '.label');
  return errors;
}

function apiPositionErrors(value, path) {
  const errors = [];
  if (value === null) return errors;
  add(errors, exactKeys(value, API_POSITION_KEYS), path + '.shape');
  add(errors, nonNegativeInteger(value?.code), path + '.code');
  add(errors, nullableLabel(value?.label), path + '.label');
  errors.push(...apiPositionRelationErrors(value?.parent, path + '.parent'));
  errors.push(...apiPositionRelationErrors(value?.dependsOn, path + '.dependsOn'));
  return errors;
}

function apiPositionObservationErrors(value, path, snapshotAsOf) {
  const errors = [];
  if (value === null) return errors;
  add(errors, exactKeys(value, API_POSITION_OBSERVATION_KEYS), path + '.shape');
  add(errors, nullableLabel(value?.label) && value?.label !== null, path + '.label');
  add(errors, typeof value?.observedDate === 'string' && DATE_PATTERN.test(value.observedDate),
    path + '.observedDate');
  add(errors, typeof value?.observedPeriod === 'string' && PERIOD_PATTERN.test(value.observedPeriod),
    path + '.observedPeriod');
  add(errors, POSITION_OBSERVATION_STATUSES.has(value?.status), path + '.status');
  add(errors, value?.sourceTable === 'histolegajo', path + '.sourceTable');
  add(errors,
    !value?.observedDate || !value?.observedPeriod || value.observedDate.slice(0, 7) === value.observedPeriod,
    path + '.period_identity');
  add(errors,
    value?.status !== 'source_future_effective' || value?.observedDate > snapshotAsOf,
    path + '.future_status_identity');
  add(errors,
    value?.status !== 'historical_observation' || value?.observedDate <= snapshotAsOf,
    path + '.historical_status_identity');
  return errors;
}

function apiAbsenceHistoryErrors(value, path, snapshotAsOf, expectedTotal, expectedLatest) {
  const errors = [];
  add(errors, exactKeys(value, API_ABSENCE_HISTORY_KEYS), path + '.shape');
  add(errors, nonNegativeInteger(value?.total), path + '.total');
  add(errors, value?.total === expectedTotal, path + '.total_identity');
  add(errors, value?.limit === GRH_DIRECTORY_DETAIL_ABSENCE_LIMIT, path + '.limit');
  add(errors, Array.isArray(value?.items), path + '.items.array');
  const items = Array.isArray(value?.items) ? value.items : [];
  add(errors, items.length === Math.min(expectedTotal || 0, GRH_DIRECTORY_DETAIL_ABSENCE_LIMIT),
    path + '.items.count_identity');
  let previous = null;
  items.forEach((event, index) => {
    const itemPath = path + '.items.' + index;
    add(errors, exactKeys(event, API_ABSENCE_HISTORY_ITEM_KEYS), itemPath + '.shape');
    add(errors, typeof event?.date === 'string' && DATE_PATTERN.test(event.date), itemPath + '.date');
    add(errors, nullableNonNegativeInteger(event?.days), itemPath + '.days');
    add(errors, !event?.date || event.date <= snapshotAsOf, itemPath + '.after_snapshot');
    const key = [event?.date || '', String(event?.days ?? -1)].join(':');
    add(errors, previous === null || previous.localeCompare(key, 'en', { numeric: true }) >= 0,
      path + '.deterministic_order');
    previous = key;
  });
  add(errors, items.length === 0 || items[0]?.date === expectedLatest, path + '.latest_identity');
  return errors;
}

function apiLeaveHistoryErrors(value, path, snapshotAsOf, expectedTotal) {
  const errors = [];
  add(errors, exactKeys(value, API_LEAVE_HISTORY_KEYS), path + '.shape');
  add(errors, nonNegativeInteger(value?.total), path + '.total');
  add(errors, value?.total === expectedTotal, path + '.total_identity');
  add(errors, value?.limit === GRH_DIRECTORY_DETAIL_LEAVE_LIMIT, path + '.limit');
  add(errors, Array.isArray(value?.items), path + '.items.array');
  const items = Array.isArray(value?.items) ? value.items : [];
  add(errors, items.length === Math.min(expectedTotal || 0, GRH_DIRECTORY_DETAIL_LEAVE_LIMIT),
    path + '.items.count_identity');
  let previous = null;
  items.forEach((event, index) => {
    const itemPath = path + '.items.' + index;
    add(errors, exactKeys(event, API_LEAVE_HISTORY_ITEM_KEYS), itemPath + '.shape');
    add(errors, typeof event?.startDate === 'string' && DATE_PATTERN.test(event.startDate),
      itemPath + '.startDate');
    add(errors, nullableDate(event?.endDate), itemPath + '.endDate');
    add(errors, nullableNonNegativeInteger(event?.days), itemPath + '.days');
    add(errors, !event?.startDate || event.startDate <= snapshotAsOf, itemPath + '.after_snapshot');
    add(errors, event?.endDate === null || event?.endDate <= snapshotAsOf, itemPath + '.end_after_snapshot');
    add(errors, event?.endDate === null || !event?.startDate || event.endDate >= event.startDate,
      itemPath + '.end_before_start');
    const key = [event?.startDate || '', event?.endDate || '', String(event?.days ?? -1)].join(':');
    add(errors, previous === null || previous.localeCompare(key, 'en', { numeric: true }) >= 0,
      path + '.deterministic_order');
    previous = key;
  });
  return errors;
}

function apiMovementErrors(value, path, snapshotAsOf) {
  const errors = [];
  add(errors, exactKeys(value, API_MOVEMENT_KEYS), path + '.shape');
  add(errors, nonNegativeInteger(value?.rowCount), path + '.rowCount');
  add(errors, nonNegativeInteger(value?.periodCount), path + '.periodCount');
  add(errors,
    value?.latestPeriod == null || (
      typeof value?.latestPeriod === 'string' && PERIOD_PATTERN.test(value.latestPeriod)
    ),
    path + '.latestPeriod');
  add(errors,
    value?.latestPeriod == null || value?.latestPeriod <= snapshotAsOf.slice(0, 7),
    path + '.after_snapshot');
  add(errors, (value?.periodCount === 0) === (value?.latestPeriod === null), path + '.latest_identity');
  add(errors, (value?.rowCount === 0) === (value?.periodCount === 0), path + '.empty_identity');
  return errors;
}

function apiMovementHistoryErrors(value, path, snapshotAsOf, expectedTotal, expectedRows, expectedLatest) {
  const errors = [];
  add(errors, exactKeys(value, API_MOVEMENT_HISTORY_KEYS), path + '.shape');
  add(errors, nonNegativeInteger(value?.total), path + '.total');
  add(errors, value?.total === expectedTotal, path + '.total_identity');
  add(errors, value?.limit === GRH_DIRECTORY_DETAIL_MOVEMENT_LIMIT, path + '.limit');
  add(errors, Array.isArray(value?.items), path + '.items.array');
  const items = Array.isArray(value?.items) ? value.items : [];
  add(errors, items.length === Math.min(expectedTotal || 0, GRH_DIRECTORY_DETAIL_MOVEMENT_LIMIT),
    path + '.items.count_identity');
  let previous = null;
  const seen = new Set();
  items.forEach((event, index) => {
    const itemPath = path + '.items.' + index;
    add(errors, exactKeys(event, API_MOVEMENT_HISTORY_ITEM_KEYS), itemPath + '.shape');
    add(errors, typeof event?.period === 'string' && PERIOD_PATTERN.test(event.period), itemPath + '.period');
    add(errors, positiveInteger(event?.rowCount), itemPath + '.rowCount');
    add(errors, !event?.period || event.period <= snapshotAsOf.slice(0, 7), itemPath + '.after_snapshot');
    add(errors, !seen.has(event?.period), itemPath + '.unique_period');
    seen.add(event?.period);
    add(errors, previous === null || previous > event?.period, path + '.deterministic_order');
    previous = event?.period;
  });
  add(errors, items.length === 0 || items[0]?.period === expectedLatest, path + '.latest_identity');
  if ((expectedTotal || 0) <= GRH_DIRECTORY_DETAIL_MOVEMENT_LIMIT) {
    const rows = items.reduce(
      (total, event) => total + (positiveInteger(event?.rowCount) ? event.rowCount : 0),
      0,
    );
    add(errors, rows === expectedRows, path + '.row_count_identity');
  }
  return errors;
}

function apiItemErrors(item, index, snapshotAsOf, mode) {
  const path = 'items.' + index;
  const errors = [];
  add(errors, exactKeys(item, mode === 'detail' ? API_DETAIL_ITEM_KEYS : API_ITEM_KEYS), path + '.shape');
  add(errors, positiveInteger(item?.companyCode), path + '.companyCode');
  add(errors, positiveInteger(item?.legajo), path + '.legajo');
  add(errors, nullableLabel(item?.displayName), path + '.displayName');
  for (const name of ['sector', 'costCenter', 'organization', 'category', 'agreement']) {
    errors.push(...apiDimensionErrors(item?.[name], path + '.' + name));
  }
  errors.push(...apiPositionErrors(item?.position, path + '.position'));
  errors.push(...apiPositionObservationErrors(
    item?.positionObservation,
    path + '.positionObservation',
    snapshotAsOf,
  ));
  add(errors, exactKeys(item?.events, API_EVENT_KEYS), path + '.events.shape');
  for (const name of ['absenceCount', 'leaveCount']) {
    add(errors, nonNegativeInteger(item?.events?.[name]), path + '.events.' + name);
  }
  for (const name of ['latestAbsenceDate', 'latestLeaveStartDate', 'latestLeaveEndDate']) {
    add(errors, nullableDate(item?.events?.[name]), path + '.events.' + name);
    add(errors, item?.events?.[name] == null || item?.events?.[name] <= snapshotAsOf,
      path + '.events.' + name + '.after_snapshot');
  }
  add(errors,
    (item?.events?.absenceCount === 0) === (item?.events?.latestAbsenceDate === null),
    path + '.events.absence_latest_identity');
  errors.push(...apiMovementErrors(item?.movement, path + '.movement', snapshotAsOf));
  if (mode === 'detail') {
    errors.push(...apiAbsenceHistoryErrors(
      item?.absenceHistory,
      path + '.absenceHistory',
      snapshotAsOf,
      item?.events?.absenceCount,
      item?.events?.latestAbsenceDate,
    ));
    errors.push(...apiLeaveHistoryErrors(
      item?.leaveHistory,
      path + '.leaveHistory',
      snapshotAsOf,
      item?.events?.leaveCount,
    ));
    errors.push(...apiMovementHistoryErrors(
      item?.movementHistory,
      path + '.movementHistory',
      snapshotAsOf,
      item?.movement?.periodCount,
      item?.movement?.rowCount,
      item?.movement?.latestPeriod,
    ));
  }
  return errors;
}

function apiFacetsErrors(value, mode) {
  const errors = [];
  if (mode === 'detail') {
    add(errors, value === null, 'response.facets.detail_null');
    return errors;
  }
  add(errors, exactKeys(value, API_FACET_KEYS), 'response.facets.shape');
  for (const name of API_FACET_KEYS) {
    const items = value?.[name];
    add(errors, Array.isArray(items) && items.length <= 5000, 'response.facets.' + name + '.array');
    const seen = new Set();
    for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
      const path = 'response.facets.' + name + '.' + index;
      const expectedKeys = name === 'categories'
        ? API_CATEGORY_FACET_ITEM_KEYS
        : (name === 'positionObservations' ? API_POSITION_OBSERVATION_FACET_KEYS : API_FACET_ITEM_KEYS);
      add(errors, exactKeys(item, expectedKeys), path + '.shape');
      if (name === 'categories') {
        add(errors, nonNegativeInteger(item?.agreementCode), path + '.agreementCode');
      }
      if (name === 'positionObservations') {
        add(errors, POSITION_OBSERVATION_STATUSES.has(item?.status), path + '.status');
        add(errors, nullableLabel(item?.label) && item?.label !== null, path + '.label');
      } else {
        add(errors, nonNegativeInteger(item?.code), path + '.code');
        add(errors, nullableLabel(item?.label), path + '.label');
      }
      add(errors, positiveInteger(item?.count), path + '.count');
      const uniqueKey = name === 'categories'
        ? item?.agreementCode + ':' + item?.code
        : (name === 'positionObservations' ? item?.status + ':' + item?.label : item?.code);
      add(errors, !seen.has(uniqueKey), path + '.unique_code');
      seen.add(uniqueKey);
    }
  }
  return errors;
}

export function inspectGrhDirectoryResponse(value) {
  const errors = [];
  add(errors, exactKeys(value, API_KEYS), 'response.shape');
  add(errors, value?.schemaVersion === GRH_DIRECTORY_SCHEMA_VERSION, 'response.schemaVersion');
  add(errors, exactKeys(value?.source, API_SOURCE_KEYS), 'response.source.shape');
  add(errors, typeof value?.source?.canonicalSystem === 'string' && value.source.canonicalSystem.length > 0,
    'response.source.canonicalSystem');
  add(errors, typeof value?.source?.sourceFile === 'string' && value.source.sourceFile.endsWith('.sql.gz'),
    'response.source.sourceFile');
  add(errors, SHA256_PATTERN.test(value?.source?.sourceSha256 || ''), 'response.source.sourceSha256');
  add(errors, DATE_PATTERN.test(value?.source?.snapshotAsOf || ''), 'response.source.snapshotAsOf');
  add(errors, exactKeys(value?.privacy, API_PRIVACY_KEYS), 'response.privacy.shape');
  add(errors, value?.privacy?.containsPersonalData === true, 'response.privacy.personalData');
  add(errors,
    JSON.stringify(value?.privacy?.excludedFields) === JSON.stringify(GRH_DIRECTORY_EXCLUDED_FIELDS),
    'response.privacy.excludedFields');
  add(errors, exactKeys(value?.query, API_QUERY_KEYS), 'response.query.shape');
  add(errors, value?.query?.mode === 'list' || value?.query?.mode === 'detail', 'response.query.mode');
  add(errors, positiveInteger(value?.query?.page), 'response.query.page');
  add(errors, positiveInteger(value?.query?.limit) && value.query.limit <= 100, 'response.query.limit');
  add(errors, nonNegativeInteger(value?.query?.total), 'response.query.total');
  add(errors, typeof value?.query?.hasNext === 'boolean', 'response.query.hasNext');
  for (const name of ['cursor', 'nextCursor']) {
    add(errors, value?.query?.[name] === null || (
      typeof value?.query?.[name] === 'string' &&
      value.query[name].length > 0 &&
      value.query[name].length <= 512
    ), 'response.query.' + name);
  }
  add(errors,
    value?.query?.mode === 'detail' || Boolean(value?.query?.nextCursor) === value?.query?.hasNext,
    'response.query.next_cursor_identity');
  errors.push(...apiFacetsErrors(value?.facets, value?.query?.mode));
  add(errors, Array.isArray(value?.items), 'response.items.array');
  const items = Array.isArray(value?.items) ? value.items : [];
  items.forEach((item, index) => errors.push(...apiItemErrors(
    item,
    index,
    value?.source?.snapshotAsOf || '',
    value?.query?.mode,
  )));
  add(errors, items.length <= (value?.query?.limit || 0), 'response.items.limit');
  if (value?.query?.mode === 'detail') {
    add(errors, items.length === 1 && value?.query?.total === 1 && value?.query?.hasNext === false,
      'response.detail.identity');
    add(errors, value?.query?.cursor === null && value?.query?.nextCursor === null,
      'response.detail.cursor_identity');
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)]) });
}

export function validateGrhDirectoryArtifact(value) {
  return inspectGrhDirectoryArtifact(value).ok;
}

export function validateGrhDirectoryResponse(value) {
  return inspectGrhDirectoryResponse(value).ok;
}
