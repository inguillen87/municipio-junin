import type {
  OrganizationAnalyticsContract,
  OrganizationAnalyticsDimension,
  OrganizationAnalyticsRankingRow,
} from './organization-analytics-types';

const ENDPOINT = '/api/grh-organization-analytics';
const CONTRACT_HEADER = 'x-municontrol-contract';
const SCHEMA_VERSION = 'grh-organization-analytics-v2';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const ORGANIZATION_THRESHOLD = 10;
const WORKFORCE_THRESHOLD = 10;
const ORGANIZATION_PROTECTED_LABEL = 'Otros grupos protegidos';
const WORKFORCE_PROTECTED_LABEL = 'Otros (celdas protegidas)';

const ACTIONS = Object.freeze([
  Object.freeze({
    id: 'open_workforce_dashboard',
    label: 'Abrir Gestión de personas',
    href: '/rrhh',
    requiredCapability: 'navigation.rrhh',
  }),
  Object.freeze({
    id: 'open_executive_summary',
    label: 'Abrir resumen ejecutivo',
    href: '/ejecutivo',
    requiredCapability: 'navigation.grh-executive',
  }),
  Object.freeze({
    id: 'open_data_quality',
    label: 'Revisar calidad de datos',
    href: '/calidad',
    requiredCapability: 'navigation.data-quality',
  }),
  Object.freeze({
    id: 'export_executive_report',
    label: 'Abrir reportes ejecutivos',
    href: '/reportes',
    requiredCapability: 'navigation.reports',
  }),
]);

const LIMITS = Object.freeze([
  'snapshot_historical',
  'registered_records_not_active_workforce',
  'absence_events_not_absence_rate',
  'absence_events_not_causal',
  'positions_not_current_hierarchy',
  'no_realtime',
]);

const SHAPES = {
  top: [
    'schemaVersion', 'source', 'privacy', 'coverage', 'organizations', 'sectors', 'matrix',
    'absenceRanking', 'dataQuality', 'payrollCohort', 'activity', 'actions', 'limits',
  ],
  source: ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf'],
  privacy: [
    'threshold', 'containsPii', 'identifiersExported', 'labelsProtectedBeforeRanking',
    'complementarySuppression',
  ],
  coverage: [
    'registeredRecords', 'withOrganization', 'withSector', 'withOrganizationAndSector',
    'withAbsenceHistory', 'absenceEvents',
  ],
  coverageMetric: ['records', 'sharePct'],
  dimension: [
    'dimension', 'denominatorRecords', 'categoryCount', 'releasedCategoryCount',
    'protectedCategoryCount', 'rows',
  ],
  dimensionRow: [
    'code', 'label', 'registeredRecords', 'sharePct', 'recordsWithAbsence', 'absenceEvents',
    'eventsPerRegisteredRecord', 'absencePrivacyStatus', 'privacyStatus',
  ],
  absenceRanking: ['historical', 'denominatorRecords', 'recordsWithAbsence', 'absenceEvents', 'rows'],
  matrix: [
    'rowDimension', 'columnDimension', 'rows', 'columns', 'cells', 'releasedCellCount',
    'protectedCellCount', 'maxReleasedRecords',
  ],
  matrixAxis: ['code', 'label'],
  matrixCell: ['organizationCode', 'sectorCode', 'registeredRecords', 'privacyStatus'],
  dataQuality: [
    'missingOrganizationRecords', 'missingSectorRecords', 'missingBothRecords',
    'invalidEmployeeKeyRows', 'unmatchedPersonRecords', 'validAbsenceEvents',
    'quarantinedAbsenceEvents', 'linkedAbsenceEvents', 'unlinkedValidAbsenceEvents',
    'codedPositionRecords', 'positionObservationRecords', 'futureEffectivePositionObservationRecords',
    'firstFuturePositionDate', 'lastFuturePositionDate',
  ],
  payrollCohort: [
    'definition', 'referencePeriod', 'payrollParticipants', 'bySector', 'byCostCenter', 'byAgreement',
  ],
  workforceRanking: ['threshold', 'totalParticipants', 'participantDisplay', 'privacyStatus', 'rows'],
  workforceRow: [
    'companyCode', 'sourceCode', 'label', 'participants', 'participantDisplay', 'sharePct',
    'privacyStatus',
  ],
  activity: ['absence', 'movements'],
  activityDomain: ['sourceTable', 'metric', 'series'],
  activityRow: ['period', 'value', 'participantCount', 'participantDisplay', 'privacyStatus'],
  action: ['id', 'label', 'href', 'requiredCapability'],
} as const;

const SAFE_MESSAGES = {
  ORGANIZATION_CLIENT_UNAVAILABLE: 'El cliente autenticado de datos no está disponible.',
  ORGANIZATION_CLIENT_UNSUPPORTED: 'El navegador no admite la carga segura de datos.',
  ORGANIZATION_OPTIONS_INVALID: 'La configuración de carga no es válida.',
  ORGANIZATION_REQUEST_TIMEOUT: 'La consulta excedió el tiempo permitido.',
  ORGANIZATION_REQUEST_ABORTED: 'La consulta fue cancelada.',
  ORGANIZATION_REQUEST_FAILED: 'No se pudo consultar la fuente GRH.',
  ORGANIZATION_RESPONSE_INVALID: 'La respuesta GRH no es válida.',
  ORGANIZATION_HTTP_ERROR: 'La fuente GRH respondió con un estado no exitoso.',
  ORGANIZATION_RESPONSE_NOT_JSON: 'La fuente GRH no entregó un contrato JSON.',
  ORGANIZATION_RESPONSE_INVALID_JSON: 'La fuente GRH entregó un JSON inválido.',
  ORGANIZATION_RESPONSE_CONTRACT_MISMATCH: 'La fuente GRH no declaró el contrato esperado.',
  ORGANIZATION_CONTRACT_INVALID: 'El contrato de dotación y ausencias fue rechazado.',
} as const;

export type OrganizationAnalyticsContractErrorCode = keyof typeof SAFE_MESSAGES;

export class OrganizationAnalyticsContractError extends Error {
  readonly code: OrganizationAnalyticsContractErrorCode;
  readonly status: number;

  constructor(code: OrganizationAnalyticsContractErrorCode, status?: number) {
    super(SAFE_MESSAGES[code]);
    this.name = 'OrganizationAnalyticsContractError';
    this.code = code;
    this.status = validStatus(status) ? status : 0;
  }
}

export interface FetchOrganizationAnalyticsOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal | null;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: unknown, expected: readonly string[]): value is UnknownRecord {
  if (!record(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function validStatus(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 100 && (value as number) <= 599;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function shortText(value: unknown, maximum = 200): value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum) return false;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 31 || codeUnit === 127) return false;
  }
  return true;
}

function safeCode(value: unknown): boolean {
  return nonNegativeInteger(value) || (shortText(value, 64) && /^[A-Za-z0-9._/-]+$/.test(value));
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function expectedShare(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round4(numerator / denominator * 100);
}

function closeTo(left: unknown, right: number): boolean {
  return typeof left === 'number' && Number.isFinite(left) && Math.abs(left - right) <= 0.0001;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function validSource(value: unknown): boolean {
  return exactKeys(value, SHAPES.source) && shortText(value.canonicalSystem, 100) &&
    typeof value.sourceFile === 'string' && value.sourceFile.endsWith('.sql.gz') &&
    value.sourceFile.length <= 240 && !/[\\/]/u.test(value.sourceFile) &&
    typeof value.sourceSha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sourceSha256) &&
    validDate(value.snapshotAsOf);
}

function validPrivacy(value: unknown): boolean {
  return exactKeys(value, SHAPES.privacy) && value.threshold === ORGANIZATION_THRESHOLD &&
    value.containsPii === false && value.identifiersExported === false &&
    value.labelsProtectedBeforeRanking === true && value.complementarySuppression === true;
}

function validCoverageMetric(value: unknown, total: number): boolean {
  return exactKeys(value, SHAPES.coverageMetric) && nonNegativeInteger(value.records) &&
    value.records <= total && closeTo(value.sharePct, expectedShare(value.records, total));
}

function validCoverage(value: unknown): boolean {
  if (!exactKeys(value, SHAPES.coverage) || !positiveInteger(value.registeredRecords)) return false;
  const total = value.registeredRecords;
  if (!validCoverageMetric(value.withOrganization, total) ||
      !validCoverageMetric(value.withSector, total) ||
      !validCoverageMetric(value.withOrganizationAndSector, total) ||
      !validCoverageMetric(value.withAbsenceHistory, total)) return false;
  const organization = value.withOrganization as UnknownRecord;
  const sector = value.withSector as UnknownRecord;
  const intersection = value.withOrganizationAndSector as UnknownRecord;
  const absenceHistory = value.withAbsenceHistory as UnknownRecord;
  return (intersection.records as number) <= (organization.records as number) &&
    (intersection.records as number) <= (sector.records as number) &&
    nonNegativeInteger(value.absenceEvents) &&
    value.absenceEvents >= (absenceHistory.records as number) &&
    (absenceHistory.records as number) >= ORGANIZATION_THRESHOLD;
}

function validDimensionRow(
  value: unknown,
  denominator: number,
  shareMode: 'records' | 'events',
): value is OrganizationAnalyticsRankingRow {
  if (!exactKeys(value, SHAPES.dimensionRow) ||
      !['released', 'protected_aggregate', 'suppressed'].includes(String(value.privacyStatus)) ||
      !nonNegativeInteger(value.registeredRecords) || value.registeredRecords < ORGANIZATION_THRESHOLD ||
      value.registeredRecords > denominator) return false;
  const released = value.privacyStatus === 'released';
  if (released) {
    if (!nonNegativeInteger(value.code) || !shortText(value.label)) return false;
  } else if (value.code !== null || value.label !== ORGANIZATION_PROTECTED_LABEL) return false;

  if (!['released', 'protected'].includes(String(value.absencePrivacyStatus))) return false;
  if (value.absencePrivacyStatus === 'released') {
    if (!nonNegativeInteger(value.recordsWithAbsence) ||
        value.recordsWithAbsence < ORGANIZATION_THRESHOLD ||
        value.recordsWithAbsence > value.registeredRecords ||
        !nonNegativeInteger(value.absenceEvents) || value.absenceEvents < value.recordsWithAbsence ||
        !closeTo(value.eventsPerRegisteredRecord, value.absenceEvents / value.registeredRecords)) return false;
  } else if (value.recordsWithAbsence !== null || value.absenceEvents !== null ||
      value.eventsPerRegisteredRecord !== null) return false;

  const numerator = shareMode === 'events' ? value.absenceEvents : value.registeredRecords;
  if (numerator === null) return value.sharePct === null;
  return closeTo(value.sharePct, expectedShare(numerator, denominator));
}

function validDimension(
  value: unknown,
  dimension: 'organization' | 'sector',
  coverage: UnknownRecord,
): value is OrganizationAnalyticsDimension {
  if (!exactKeys(value, SHAPES.dimension) || value.dimension !== dimension ||
      !nonNegativeInteger(value.categoryCount) || !nonNegativeInteger(value.releasedCategoryCount) ||
      !nonNegativeInteger(value.protectedCategoryCount) || !Array.isArray(value.rows)) return false;
  const coverageMetric = coverage[dimension === 'organization' ? 'withOrganization' : 'withSector'];
  if (!record(coverageMetric) || value.denominatorRecords !== coverageMetric.records ||
      !nonNegativeInteger(value.denominatorRecords)) return false;
  if (value.releasedCategoryCount + value.protectedCategoryCount !== value.categoryCount ||
      value.rows.length !== value.releasedCategoryCount + (value.protectedCategoryCount > 0 ? 1 : 0)) return false;

  let total = 0;
  let released = 0;
  let protectedRows = 0;
  const codes = new Set<number>();
  for (const row of value.rows) {
    if (!validDimensionRow(row, value.denominatorRecords, 'records') ||
        row.absencePrivacyStatus !== 'protected') return false;
    total += row.registeredRecords;
    if (row.code === null) protectedRows += 1;
    else {
      if (codes.has(row.code)) return false;
      codes.add(row.code);
      released += 1;
    }
  }
  return total === value.denominatorRecords && released === value.releasedCategoryCount &&
    protectedRows === (value.protectedCategoryCount > 0 ? 1 : 0);
}

function validAbsenceRanking(value: unknown, coverage: UnknownRecord): boolean {
  if (!exactKeys(value, SHAPES.absenceRanking) || value.historical !== true ||
      value.denominatorRecords !== coverage.registeredRecords || !positiveInteger(value.denominatorRecords) ||
      !record(coverage.withAbsenceHistory) || value.recordsWithAbsence !== coverage.withAbsenceHistory.records ||
      value.absenceEvents !== coverage.absenceEvents || !positiveInteger(value.absenceEvents) ||
      !Array.isArray(value.rows) || value.rows.length === 0) return false;
  let records = 0;
  let recordsWithAbsence = 0;
  let events = 0;
  let protectedRows = 0;
  const codes = new Set<number>();
  for (const row of value.rows) {
    if (!validDimensionRow(row, value.absenceEvents, 'events') ||
        row.absencePrivacyStatus !== 'released' || row.recordsWithAbsence === null ||
        row.absenceEvents === null) return false;
    records += row.registeredRecords;
    recordsWithAbsence += row.recordsWithAbsence;
    events += row.absenceEvents;
    if (row.code === null) protectedRows += 1;
    else {
      if (codes.has(row.code)) return false;
      codes.add(row.code);
    }
  }
  return records === value.denominatorRecords && recordsWithAbsence === value.recordsWithAbsence &&
    events === value.absenceEvents && protectedRows <= 1;
}

function validMatrix(value: unknown): boolean {
  if (!exactKeys(value, SHAPES.matrix) || value.rowDimension !== 'organization' ||
      value.columnDimension !== 'sector' || !Array.isArray(value.rows) || !Array.isArray(value.columns) ||
      value.rows.length === 0 || value.rows.length > 8 || value.columns.length === 0 ||
      value.columns.length > 8 || !Array.isArray(value.cells)) return false;
  const validateAxis = (rows: unknown[]): Map<number, string> | null => {
    const codes = new Map<number, string>();
    for (const row of rows) {
      if (!exactKeys(row, SHAPES.matrixAxis) || !nonNegativeInteger(row.code) ||
          !shortText(row.label) || codes.has(row.code)) return null;
      codes.set(row.code, row.label);
    }
    return codes;
  };
  const rowCodes = validateAxis(value.rows);
  const columnCodes = validateAxis(value.columns);
  if (!rowCodes || !columnCodes || value.cells.length !== rowCodes.size * columnCodes.size) return false;
  const seen = new Set<string>();
  const rowUnknown = new Map([...rowCodes.keys()].map(code => [code, 0]));
  const columnUnknown = new Map([...columnCodes.keys()].map(code => [code, 0]));
  let released = 0;
  let protectedCount = 0;
  let maximum = 0;
  for (const cell of value.cells) {
    if (!exactKeys(cell, SHAPES.matrixCell) || !nonNegativeInteger(cell.organizationCode) ||
        !nonNegativeInteger(cell.sectorCode) || !rowCodes.has(cell.organizationCode) ||
        !columnCodes.has(cell.sectorCode)) return false;
    const key = `${cell.organizationCode}:${cell.sectorCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (cell.privacyStatus === 'released') {
      if (!nonNegativeInteger(cell.registeredRecords) || cell.registeredRecords < ORGANIZATION_THRESHOLD) return false;
      released += 1;
      maximum = Math.max(maximum, cell.registeredRecords);
    } else if (cell.privacyStatus === 'not_observed') {
      if (cell.registeredRecords !== 0) return false;
    } else if (cell.privacyStatus === 'primary_suppressed' ||
        cell.privacyStatus === 'complementary_suppressed') {
      if (cell.registeredRecords !== null) return false;
      protectedCount += 1;
      rowUnknown.set(cell.organizationCode, (rowUnknown.get(cell.organizationCode) ?? 0) + 1);
      columnUnknown.set(cell.sectorCode, (columnUnknown.get(cell.sectorCode) ?? 0) + 1);
    } else return false;
  }
  return released === value.releasedCellCount && protectedCount === value.protectedCellCount &&
    maximum === value.maxReleasedRecords && [...rowUnknown.values()].every(count => count !== 1) &&
    [...columnUnknown.values()].every(count => count !== 1);
}

function validDataQuality(value: unknown, coverage: UnknownRecord, source: UnknownRecord): boolean {
  if (!exactKeys(value, SHAPES.dataQuality)) return false;
  const integerKeys = SHAPES.dataQuality.filter(key => !key.endsWith('Date'));
  if (!integerKeys.every(key => nonNegativeInteger(value[key]))) return false;
  const total = coverage.registeredRecords;
  if (!nonNegativeInteger(total) || !record(coverage.withOrganization) || !record(coverage.withSector) ||
      !record(coverage.withOrganizationAndSector)) return false;
  const missingOrganizationRecords = Number(value.missingOrganizationRecords);
  const missingSectorRecords = Number(value.missingSectorRecords);
  const missingBothRecords = Number(value.missingBothRecords);
  if (value.missingOrganizationRecords !== total - (coverage.withOrganization.records as number) ||
      value.missingSectorRecords !== total - (coverage.withSector.records as number) ||
      coverage.withOrganizationAndSector.records !== total - missingOrganizationRecords -
        missingSectorRecords + missingBothRecords ||
      value.linkedAbsenceEvents !== coverage.absenceEvents ||
      value.validAbsenceEvents !== (value.linkedAbsenceEvents as number) + (value.unlinkedValidAbsenceEvents as number) ||
      (value.codedPositionRecords as number) > total || (value.positionObservationRecords as number) > total ||
      (value.futureEffectivePositionObservationRecords as number) > (value.positionObservationRecords as number)) return false;
  const hasFuture = (value.futureEffectivePositionObservationRecords as number) > 0;
  if (!hasFuture) return value.firstFuturePositionDate === null && value.lastFuturePositionDate === null;
  return validDate(value.firstFuturePositionDate) && validDate(value.lastFuturePositionDate) &&
    typeof source.snapshotAsOf === 'string' && value.firstFuturePositionDate > source.snapshotAsOf &&
    value.lastFuturePositionDate >= value.firstFuturePositionDate;
}

function validWorkforceRanking(value: unknown, totalParticipants: number): boolean {
  if (!exactKeys(value, SHAPES.workforceRanking) || value.threshold !== WORKFORCE_THRESHOLD ||
      value.totalParticipants !== totalParticipants || value.participantDisplay !== String(totalParticipants) ||
      !['released', 'partially_suppressed'].includes(String(value.privacyStatus)) ||
      !Array.isArray(value.rows) || value.rows.length === 0 || value.rows.length > 101) return false;
  let total = 0;
  let protectedRows = 0;
  const identities = new Set<string>();
  for (const row of value.rows) {
    if (!exactKeys(row, SHAPES.workforceRow) || !nonNegativeInteger(row.participants) ||
        row.participants < WORKFORCE_THRESHOLD || row.participantDisplay !== String(row.participants) ||
        !closeTo(row.sharePct, expectedShare(row.participants, totalParticipants))) return false;
    if (row.privacyStatus === 'released') {
      if (!safeCode(row.companyCode) || !safeCode(row.sourceCode) || !shortText(row.label, 160) ||
          row.label === WORKFORCE_PROTECTED_LABEL) return false;
      const identity = `${String(row.companyCode)}:${String(row.sourceCode)}:${row.label}`;
      if (identities.has(identity)) return false;
      identities.add(identity);
    } else if (row.privacyStatus === 'protected_aggregate') {
      protectedRows += 1;
      if (row.companyCode !== null || row.sourceCode !== null || row.label !== WORKFORCE_PROTECTED_LABEL) return false;
    } else return false;
    total += row.participants;
  }
  return total === totalParticipants && protectedRows <= 1 &&
    value.privacyStatus === (protectedRows === 0 ? 'released' : 'partially_suppressed');
}

function validPayrollCohort(value: unknown): boolean {
  if (!exactKeys(value, SHAPES.payrollCohort) || !shortText(value.definition, 500) ||
      typeof value.referencePeriod !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value.referencePeriod) ||
      !positiveInteger(value.payrollParticipants)) {
    return false;
  }
  return validWorkforceRanking(value.bySector, value.payrollParticipants) &&
    validWorkforceRanking(value.byCostCenter, value.payrollParticipants) &&
    validWorkforceRanking(value.byAgreement, value.payrollParticipants);
}

function validSectorPayrollIsolation(sectors: unknown, payrollCohort: unknown): boolean {
  if (!exactKeys(sectors, SHAPES.dimension) || !Array.isArray(sectors.rows) ||
      !exactKeys(payrollCohort, SHAPES.payrollCohort) ||
      !exactKeys(payrollCohort.bySector, SHAPES.workforceRanking) ||
      !Array.isArray(payrollCohort.bySector.rows)) return false;
  const payrollByCode = new Map<string, number>();
  for (const row of payrollCohort.bySector.rows) {
    if (!exactKeys(row, SHAPES.workforceRow) || row.privacyStatus !== 'released' ||
        !safeCode(row.sourceCode) || !nonNegativeInteger(row.participants)) continue;
    const code = String(row.sourceCode);
    payrollByCode.set(code, (payrollByCode.get(code) ?? 0) + row.participants);
  }
  for (const row of sectors.rows) {
    if (!exactKeys(row, SHAPES.dimensionRow) || row.privacyStatus !== 'released' ||
        !nonNegativeInteger(row.registeredRecords) || !nonNegativeInteger(row.code)) continue;
    const participants = payrollByCode.get(String(row.code));
    if (participants === undefined) continue;
    const complement = row.registeredRecords - participants;
    if (complement < 0 || (complement > 0 && complement < ORGANIZATION_THRESHOLD)) return false;
  }
  return true;
}

function validActivityDomain(
  value: unknown,
  sourceTable: 'ausencia' | 'legamov',
  snapshotAsOf: string,
): boolean {
  if (!exactKeys(value, SHAPES.activityDomain) || value.sourceTable !== sourceTable ||
      value.metric !== 'valid_rows_by_year' || !Array.isArray(value.series) || value.series.length === 0 ||
      value.series.length > 200) return false;
  const periods = new Set<string>();
  let protectedRows = 0;
  const snapshotYear = Number(snapshotAsOf.slice(0, 4));
  for (const row of value.series) {
    if (!exactKeys(row, SHAPES.activityRow)) return false;
    if (row.privacyStatus === 'released') {
      if (typeof row.period !== 'string' || !/^\d{4}$/.test(row.period) || periods.has(row.period) ||
          Number(row.period) > snapshotYear ||
          !nonNegativeInteger(row.value) || !nonNegativeInteger(row.participantCount) ||
          row.participantCount < ORGANIZATION_THRESHOLD || row.participantCount > row.value ||
          row.participantDisplay !== String(row.participantCount)) return false;
      periods.add(row.period);
    } else if (row.privacyStatus === 'suppressed') {
      protectedRows += 1;
      if (row.period !== null || row.value !== null || row.participantCount !== null ||
          row.participantDisplay !== 'Protegido') return false;
    } else return false;
  }
  return protectedRows === 0 || protectedRows >= 2;
}

function validActions(value: unknown): boolean {
  return Array.isArray(value) && value.length === ACTIONS.length && value.every((action, index) =>
    exactKeys(action, SHAPES.action) && JSON.stringify(action) === JSON.stringify(ACTIONS[index]));
}

function validContract(value: unknown): value is OrganizationAnalyticsContract {
  if (!exactKeys(value, SHAPES.top) || value.schemaVersion !== SCHEMA_VERSION ||
      !validSource(value.source) || !validPrivacy(value.privacy) || !validCoverage(value.coverage) ||
      !record(value.coverage) || !validDimension(value.organizations, 'organization', value.coverage) ||
      !validDimension(value.sectors, 'sector', value.coverage) || !validMatrix(value.matrix) ||
      !validAbsenceRanking(value.absenceRanking, value.coverage) || !record(value.source) ||
      !validDataQuality(value.dataQuality, value.coverage, value.source) ||
      !validPayrollCohort(value.payrollCohort) ||
      !validSectorPayrollIsolation(value.sectors, value.payrollCohort) ||
      !exactKeys(value.activity, SHAPES.activity) ||
      !validActivityDomain(value.activity.absence, 'ausencia', String(value.source.snapshotAsOf)) ||
      !validActivityDomain(value.activity.movements, 'legamov', String(value.source.snapshotAsOf)) ||
      !validActions(value.actions) ||
      JSON.stringify(value.limits) !== JSON.stringify(LIMITS)) return false;
  return true;
}

export function validateOrganizationAnalyticsContract(value: unknown): value is OrganizationAnalyticsContract {
  try {
    return validContract(value);
  } catch {
    return false;
  }
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object') return value;
  const objectValue = value as object;
  if (seen.has(objectValue)) return value;
  seen.add(objectValue);
  const keyedValue = value as Record<string, unknown>;
  for (const key of Object.keys(value)) deepFreeze(keyedValue[key], seen);
  return Object.freeze(value);
}

function fail(code: OrganizationAnalyticsContractErrorCode, status?: number): never {
  throw new OrganizationAnalyticsContractError(code, status);
}

function normalizeOptions(
  options?: FetchOrganizationAnalyticsOptions,
): Required<FetchOrganizationAnalyticsOptions> {
  if (options === undefined) return { timeoutMs: DEFAULT_TIMEOUT_MS, signal: null };
  const candidate: unknown = options;
  if (!record(candidate) || !Object.keys(candidate).every(key => key === 'timeoutMs' || key === 'signal')) {
    fail('ORGANIZATION_OPTIONS_INVALID');
  }
  const timeoutMs = candidate.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : candidate.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || (timeoutMs as number) < 1 || (timeoutMs as number) > MAX_TIMEOUT_MS) {
    fail('ORGANIZATION_OPTIONS_INVALID');
  }
  const signal = candidate.signal === undefined ? null : candidate.signal;
  if (signal !== null && (!record(signal) || typeof signal.aborted !== 'boolean' ||
      typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) {
    fail('ORGANIZATION_OPTIONS_INVALID');
  }
  return { timeoutMs: timeoutMs as number, signal: signal as AbortSignal | null };
}

interface RequestControl {
  readonly signal: AbortSignal;
  readonly timedOut: () => boolean;
  readonly callerAborted: () => boolean;
  readonly cleanup: () => void;
}

function requestControl(options?: FetchOrganizationAnalyticsOptions): RequestControl {
  if (typeof AbortController !== 'function' || typeof setTimeout !== 'function' ||
      typeof clearTimeout !== 'function') fail('ORGANIZATION_CLIENT_UNSUPPORTED');
  const normalized = normalizeOptions(options);
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;
  const onCallerAbort = () => {
    callerAborted = true;
    if (!controller.signal.aborted) controller.abort();
  };
  if (normalized.signal) {
    if (normalized.signal.aborted) onCallerAbort();
    else normalized.signal.addEventListener('abort', onCallerAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    if (!controller.signal.aborted) controller.abort();
  }, normalized.timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    callerAborted: () => callerAborted,
    cleanup: () => {
      clearTimeout(timer);
      normalized.signal?.removeEventListener('abort', onCallerAbort);
    },
  };
}

interface AuthenticatedClient {
  fetch(input: string, init: RequestInit): Promise<Response>;
}

function authenticatedClient(): AuthenticatedClient {
  if (typeof window === 'undefined') fail('ORGANIZATION_CLIENT_UNAVAILABLE');
  const candidate = (window as Window & { MuniAuth?: unknown }).MuniAuth;
  if (!record(candidate) || typeof candidate.fetch !== 'function') fail('ORGANIZATION_CLIENT_UNAVAILABLE');
  return candidate;
}

function jsonResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type');
  return typeof contentType === 'string' &&
    /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(contentType);
}

async function requestContract(signal: AbortSignal): Promise<OrganizationAnalyticsContract> {
  const response = await authenticatedClient().fetch(ENDPOINT, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response || !validStatus(response.status) || typeof response.ok !== 'boolean') {
    fail('ORGANIZATION_RESPONSE_INVALID', 502);
  }
  if (!response.ok || response.status < 200 || response.status >= 300) {
    fail('ORGANIZATION_HTTP_ERROR', response.status);
  }
  if (!jsonResponse(response)) fail('ORGANIZATION_RESPONSE_NOT_JSON', 502);
  if (response.headers.get(CONTRACT_HEADER) !== SCHEMA_VERSION) {
    fail('ORGANIZATION_RESPONSE_CONTRACT_MISMATCH', 502);
  }
  if (typeof response.json !== 'function') fail('ORGANIZATION_RESPONSE_INVALID', 502);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    fail('ORGANIZATION_RESPONSE_INVALID_JSON', 502);
  }
  if (!validateOrganizationAnalyticsContract(payload)) fail('ORGANIZATION_CONTRACT_INVALID', 502);
  return deepFreeze(payload);
}

function mapFailure(error: unknown, control: RequestControl): OrganizationAnalyticsContractError {
  if (error instanceof OrganizationAnalyticsContractError) return error;
  if (control.timedOut()) return new OrganizationAnalyticsContractError('ORGANIZATION_REQUEST_TIMEOUT', 408);
  if (control.callerAborted()) return new OrganizationAnalyticsContractError('ORGANIZATION_REQUEST_ABORTED');
  const status = record(error) && validStatus(error.status) ? error.status : undefined;
  return new OrganizationAnalyticsContractError('ORGANIZATION_REQUEST_FAILED', status);
}

export async function fetchOrganizationAnalyticsContract(
  options?: FetchOrganizationAnalyticsOptions,
): Promise<OrganizationAnalyticsContract> {
  const control = requestControl(options);
  try {
    if (control.callerAborted()) fail('ORGANIZATION_REQUEST_ABORTED');
    return await requestContract(control.signal);
  } catch (error) {
    throw mapFailure(error, control);
  } finally {
    control.cleanup();
  }
}
