import {
  GRH_PRIVACY_THRESHOLDS,
  GRH_PROTECTED_BUCKET_LABEL,
} from './grh-privacy.js';

export const GRH_ORGANIZATION_ANALYTICS_SCHEMA_VERSION = 'grh-organization-analytics-v2';
export const GRH_ORGANIZATION_ANALYTICS_THRESHOLD = 10;
export const GRH_ORGANIZATION_ANALYTICS_PROTECTED_LABEL = 'Otros grupos protegidos';

export const GRH_ORGANIZATION_ANALYTICS_ACTIONS = Object.freeze([
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

export const GRH_ORGANIZATION_ANALYTICS_LIMITS = Object.freeze([
  'snapshot_historical',
  'registered_records_not_active_workforce',
  'absence_events_not_absence_rate',
  'absence_events_not_causal',
  'positions_not_current_hierarchy',
  'no_realtime',
]);

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TOP_LEVEL_KEYS = Object.freeze([
  'schemaVersion',
  'source',
  'privacy',
  'coverage',
  'organizations',
  'sectors',
  'matrix',
  'absenceRanking',
  'payrollCohort',
  'activity',
  'dataQuality',
  'actions',
  'limits',
]);
const SOURCE_KEYS = Object.freeze([
  'canonicalSystem',
  'sourceFile',
  'sourceSha256',
  'snapshotAsOf',
]);
const PRIVACY_KEYS = Object.freeze([
  'threshold',
  'containsPii',
  'identifiersExported',
  'labelsProtectedBeforeRanking',
  'complementarySuppression',
]);
const COVERAGE_KEYS = Object.freeze([
  'registeredRecords',
  'withOrganization',
  'withSector',
  'withOrganizationAndSector',
  'withAbsenceHistory',
  'absenceEvents',
]);
const COVERAGE_METRIC_KEYS = Object.freeze(['records', 'sharePct']);
const DIMENSION_KEYS = Object.freeze([
  'dimension',
  'denominatorRecords',
  'categoryCount',
  'releasedCategoryCount',
  'protectedCategoryCount',
  'rows',
]);
const RANKING_ROW_KEYS = Object.freeze([
  'code',
  'label',
  'registeredRecords',
  'sharePct',
  'recordsWithAbsence',
  'absenceEvents',
  'eventsPerRegisteredRecord',
  'absencePrivacyStatus',
  'privacyStatus',
]);
const ABSENCE_RANKING_KEYS = Object.freeze([
  'historical',
  'denominatorRecords',
  'recordsWithAbsence',
  'absenceEvents',
  'rows',
]);
const MATRIX_KEYS = Object.freeze([
  'rowDimension',
  'columnDimension',
  'rows',
  'columns',
  'cells',
  'releasedCellCount',
  'protectedCellCount',
  'maxReleasedRecords',
]);
const MATRIX_AXIS_KEYS = Object.freeze(['code', 'label']);
const MATRIX_CELL_KEYS = Object.freeze([
  'organizationCode',
  'sectorCode',
  'registeredRecords',
  'privacyStatus',
]);
const DATA_QUALITY_KEYS = Object.freeze([
  'missingOrganizationRecords',
  'missingSectorRecords',
  'missingBothRecords',
  'invalidEmployeeKeyRows',
  'unmatchedPersonRecords',
  'validAbsenceEvents',
  'quarantinedAbsenceEvents',
  'linkedAbsenceEvents',
  'unlinkedValidAbsenceEvents',
  'codedPositionRecords',
  'positionObservationRecords',
  'futureEffectivePositionObservationRecords',
  'firstFuturePositionDate',
  'lastFuturePositionDate',
]);
const ACTION_KEYS = Object.freeze(['id', 'label', 'href', 'requiredCapability']);
const PAYROLL_COHORT_KEYS = Object.freeze([
  'definition',
  'referencePeriod',
  'payrollParticipants',
  'bySector',
  'byCostCenter',
  'byAgreement',
]);
const EXECUTIVE_RANKING_KEYS = Object.freeze([
  'threshold',
  'totalParticipants',
  'participantDisplay',
  'privacyStatus',
  'rows',
]);
const EXECUTIVE_RANKING_ROW_KEYS = Object.freeze([
  'companyCode',
  'sourceCode',
  'label',
  'participants',
  'participantDisplay',
  'sharePct',
  'privacyStatus',
]);
const ACTIVITY_KEYS = Object.freeze(['absence', 'movements']);
const ACTIVITY_DOMAIN_KEYS = Object.freeze(['sourceTable', 'metric', 'series']);
const ACTIVITY_SERIES_ROW_KEYS = Object.freeze([
  'period',
  'value',
  'participantCount',
  'participantDisplay',
  'privacyStatus',
]);
const MATRIX_PRIVACY_STATUSES = new Set([
  'released',
  'not_observed',
  'primary_suppressed',
  'complementary_suppressed',
]);
const ROW_PRIVACY_STATUSES = new Set(['released', 'protected_aggregate', 'suppressed']);
const FORBIDDEN_KEYS = new Set([
  'display_name',
  'displayName',
  'legajo',
  'company_code',
  'dni',
  'cuil',
  'contact',
  'address',
  'bank_account',
  'salary',
  'event_cause',
  'email',
  'userId',
  'amounts',
  'compensation',
  'currency',
  'leave',
  'licencia',
  'license',
]);

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
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

function nullableNonNegativeInteger(value) {
  return value === null || nonNegativeInteger(value);
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function finitePercentage(value) {
  return finiteNonNegative(value) && value <= 100;
}

function nullableFiniteNonNegative(value) {
  return value === null || finiteNonNegative(value);
}

function safeLabel(value, maximum = 200) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function safeCode(value) {
  if (Number.isSafeInteger(value) && value >= 0) return true;
  return typeof value === 'string' && value.length > 0 && value.length <= 64 &&
    /^[A-Za-z0-9._/-]+$/u.test(value);
}

function round4(value) {
  return Number(value.toFixed(4));
}

function expectedShare(numerator, denominator) {
  return denominator === 0 ? 0 : round4((numerator / denominator) * 100);
}

function expectedIntensity(events, records) {
  return records === 0 ? 0 : round4(events / records);
}

function forbiddenKeyPaths(value, path = 'contract', seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  const errors = [];
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) errors.push(`${path}.${key}`);
    errors.push(...forbiddenKeyPaths(child, `${path}.${key}`, seen));
  }
  return errors;
}

function validateCoverageMetric(value, path, total, errors) {
  add(errors, exactKeys(value, COVERAGE_METRIC_KEYS), `${path}.shape`);
  add(errors, nonNegativeInteger(value?.records) && value.records <= total, `${path}.records`);
  add(errors,
    finiteNonNegative(value?.sharePct) && value.sharePct === expectedShare(value?.records ?? 0, total),
    `${path}.sharePct`);
}

function validateSource(source, errors) {
  add(errors, exactKeys(source, SOURCE_KEYS), 'source.shape');
  add(errors, safeLabel(source?.canonicalSystem, 100), 'source.canonicalSystem');
  add(errors,
    typeof source?.sourceFile === 'string' && source.sourceFile.endsWith('.sql.gz') &&
      source.sourceFile.length <= 240 && !/[\\/]/u.test(source.sourceFile),
    'source.sourceFile');
  add(errors, SHA256_PATTERN.test(source?.sourceSha256 || ''), 'source.sourceSha256');
  add(errors, DATE_PATTERN.test(source?.snapshotAsOf || ''), 'source.snapshotAsOf');
}

function validatePrivacy(privacy, errors) {
  add(errors, exactKeys(privacy, PRIVACY_KEYS), 'privacy.shape');
  add(errors, privacy?.threshold === GRH_ORGANIZATION_ANALYTICS_THRESHOLD, 'privacy.threshold');
  add(errors, privacy?.containsPii === false, 'privacy.containsPii');
  add(errors, privacy?.identifiersExported === false, 'privacy.identifiersExported');
  add(errors, privacy?.labelsProtectedBeforeRanking === true, 'privacy.labelsProtectedBeforeRanking');
  add(errors, privacy?.complementarySuppression === true, 'privacy.complementarySuppression');
}

function validateCoverage(coverage, errors) {
  add(errors, exactKeys(coverage, COVERAGE_KEYS), 'coverage.shape');
  const total = coverage?.registeredRecords;
  add(errors, positiveInteger(total), 'coverage.registeredRecords');
  if (!positiveInteger(total)) return;
  validateCoverageMetric(coverage.withOrganization, 'coverage.withOrganization', total, errors);
  validateCoverageMetric(coverage.withSector, 'coverage.withSector', total, errors);
  validateCoverageMetric(coverage.withOrganizationAndSector, 'coverage.withOrganizationAndSector', total, errors);
  validateCoverageMetric(coverage.withAbsenceHistory, 'coverage.withAbsenceHistory', total, errors);
  add(errors,
    coverage.withOrganizationAndSector?.records <= coverage.withOrganization?.records &&
      coverage.withOrganizationAndSector?.records <= coverage.withSector?.records,
    'coverage.dimensionIntersection');
  add(errors,
    nonNegativeInteger(coverage.absenceEvents) &&
      coverage.absenceEvents >= (coverage.withAbsenceHistory?.records ?? Number.MAX_SAFE_INTEGER),
    'coverage.absenceEvents');
  add(errors,
    (coverage.withAbsenceHistory?.records ?? 0) >= GRH_ORGANIZATION_ANALYTICS_THRESHOLD,
    'coverage.absenceThreshold');
}

function validateRankingRow(row, path, denominator, shareMode, errors) {
  add(errors, exactKeys(row, RANKING_ROW_KEYS), `${path}.shape`);
  add(errors, ROW_PRIVACY_STATUSES.has(row?.privacyStatus), `${path}.privacyStatus`);
  const released = row?.privacyStatus === 'released';
  add(errors,
    released ? nonNegativeInteger(row?.code) : row?.code === null,
    `${path}.code`);
  add(errors,
    released ? safeLabel(row?.label) : row?.label === GRH_ORGANIZATION_ANALYTICS_PROTECTED_LABEL,
    `${path}.label`);
  add(errors,
    nonNegativeInteger(row?.registeredRecords) &&
      row.registeredRecords >= GRH_ORGANIZATION_ANALYTICS_THRESHOLD &&
      row.registeredRecords <= denominator,
    `${path}.registeredRecords`);
  const shareNumerator = shareMode === 'events' ? row?.absenceEvents : row?.registeredRecords;
  if (shareMode !== 'events' || row?.absencePrivacyStatus === 'released') {
    add(errors,
      finiteNonNegative(row?.sharePct) &&
        row.sharePct === expectedShare(shareNumerator ?? 0, denominator),
      `${path}.sharePct`);
  } else {
    add(errors, row?.sharePct === null, `${path}.sharePct`);
  }
  add(errors, row?.absencePrivacyStatus === 'released' || row?.absencePrivacyStatus === 'protected',
    `${path}.absencePrivacyStatus`);
  if (row?.absencePrivacyStatus === 'released') {
    add(errors,
      nonNegativeInteger(row.recordsWithAbsence) &&
        row.recordsWithAbsence >= GRH_ORGANIZATION_ANALYTICS_THRESHOLD &&
        row.recordsWithAbsence <= row.registeredRecords,
      `${path}.recordsWithAbsence`);
    add(errors,
      nonNegativeInteger(row.absenceEvents) && row.absenceEvents >= row.recordsWithAbsence,
      `${path}.absenceEvents`);
    add(errors,
      finiteNonNegative(row.eventsPerRegisteredRecord) &&
        row.eventsPerRegisteredRecord === expectedIntensity(row.absenceEvents, row.registeredRecords),
      `${path}.eventsPerRegisteredRecord`);
  } else {
    add(errors, row?.recordsWithAbsence === null, `${path}.recordsWithAbsence.protected`);
    add(errors, row?.absenceEvents === null, `${path}.absenceEvents.protected`);
    add(errors, row?.eventsPerRegisteredRecord === null, `${path}.eventsPerRegisteredRecord.protected`);
  }
}

function validateDimension(value, dimension, coverage, errors) {
  const path = dimension === 'organization' ? 'organizations' : 'sectors';
  add(errors, exactKeys(value, DIMENSION_KEYS), `${path}.shape`);
  add(errors, value?.dimension === dimension, `${path}.dimension`);
  const expectedDenominator = dimension === 'organization'
    ? coverage?.withOrganization?.records
    : coverage?.withSector?.records;
  add(errors, value?.denominatorRecords === expectedDenominator, `${path}.denominatorRecords`);
  add(errors, nonNegativeInteger(value?.categoryCount), `${path}.categoryCount`);
  add(errors, nonNegativeInteger(value?.releasedCategoryCount), `${path}.releasedCategoryCount`);
  add(errors, nonNegativeInteger(value?.protectedCategoryCount), `${path}.protectedCategoryCount`);
  add(errors,
    value?.releasedCategoryCount + value?.protectedCategoryCount === value?.categoryCount,
    `${path}.categoryReconciliation`);
  add(errors, Array.isArray(value?.rows), `${path}.rows.array`);
  if (!Array.isArray(value?.rows) || !nonNegativeInteger(value?.denominatorRecords)) return;
  const expectedRows = value.releasedCategoryCount + (value.protectedCategoryCount > 0 ? 1 : 0);
  add(errors, value.rows.length === expectedRows, `${path}.rows.length`);
  const seenCodes = new Set();
  let registeredTotal = 0;
  let protectedRows = 0;
  value.rows.forEach((row, index) => {
    validateRankingRow(row, `${path}.rows.${index}`, value.denominatorRecords, 'records', errors);
    add(errors, row?.absencePrivacyStatus === 'protected', `${path}.rows.${index}.absenceCanonicalView`);
    add(errors, row?.recordsWithAbsence === null, `${path}.rows.${index}.recordsWithAbsence.masked`);
    add(errors, row?.absenceEvents === null, `${path}.rows.${index}.absenceEvents.masked`);
    add(errors,
      row?.eventsPerRegisteredRecord === null,
      `${path}.rows.${index}.eventsPerRegisteredRecord.masked`);
    if (row?.code !== null) {
      add(errors, !seenCodes.has(row.code), `${path}.rows.${index}.code.unique`);
      seenCodes.add(row.code);
    } else {
      protectedRows += 1;
    }
    if (nonNegativeInteger(row?.registeredRecords)) registeredTotal += row.registeredRecords;
  });
  add(errors, seenCodes.size === value.releasedCategoryCount, `${path}.releasedCategoryReconciliation`);
  add(errors, protectedRows === (value.protectedCategoryCount > 0 ? 1 : 0), `${path}.protectedRow`);
  add(errors, registeredTotal === value.denominatorRecords, `${path}.registeredReconciliation`);
}

function validateAbsenceRanking(value, coverage, errors) {
  add(errors, exactKeys(value, ABSENCE_RANKING_KEYS), 'absenceRanking.shape');
  add(errors, value?.historical === true, 'absenceRanking.historical');
  add(errors, value?.denominatorRecords === coverage?.registeredRecords, 'absenceRanking.denominatorRecords');
  add(errors,
    value?.recordsWithAbsence === coverage?.withAbsenceHistory?.records,
    'absenceRanking.recordsWithAbsence');
  add(errors, value?.absenceEvents === coverage?.absenceEvents, 'absenceRanking.absenceEvents');
  add(errors, Array.isArray(value?.rows) && value.rows.length > 0, 'absenceRanking.rows');
  if (!Array.isArray(value?.rows) || !positiveInteger(value?.denominatorRecords) ||
      !positiveInteger(value?.absenceEvents)) return;
  let registeredTotal = 0;
  let recordsWithAbsence = 0;
  let absenceEvents = 0;
  let protectedRows = 0;
  const seenCodes = new Set();
  value.rows.forEach((row, index) => {
    validateRankingRow(row, `absenceRanking.rows.${index}`, value.absenceEvents, 'events', errors);
    add(errors, row?.absencePrivacyStatus === 'released', `absenceRanking.rows.${index}.absenceReleased`);
    if (row?.code === null) protectedRows += 1;
    else {
      add(errors, !seenCodes.has(row.code), `absenceRanking.rows.${index}.code.unique`);
      seenCodes.add(row.code);
    }
    if (nonNegativeInteger(row?.registeredRecords)) registeredTotal += row.registeredRecords;
    if (nonNegativeInteger(row?.recordsWithAbsence)) recordsWithAbsence += row.recordsWithAbsence;
    if (nonNegativeInteger(row?.absenceEvents)) absenceEvents += row.absenceEvents;
  });
  add(errors, protectedRows <= 1, 'absenceRanking.protectedRows');
  add(errors, registeredTotal === value.denominatorRecords, 'absenceRanking.registeredReconciliation');
  add(errors, recordsWithAbsence === value.recordsWithAbsence, 'absenceRanking.peopleReconciliation');
  add(errors, absenceEvents === value.absenceEvents, 'absenceRanking.eventReconciliation');
}

function validateExecutiveRanking(value, path, totalParticipants, errors) {
  add(errors, exactKeys(value, EXECUTIVE_RANKING_KEYS), `${path}.shape`);
  const threshold = GRH_PRIVACY_THRESHOLDS.portable;
  add(errors, value?.threshold === threshold, `${path}.threshold`);
  add(errors, value?.totalParticipants === totalParticipants, `${path}.totalParticipants`);
  add(errors, value?.participantDisplay === String(totalParticipants), `${path}.participantDisplay`);
  add(errors,
    value?.privacyStatus === 'released' || value?.privacyStatus === 'partially_suppressed',
    `${path}.privacyStatus`);
  add(errors, Array.isArray(value?.rows) && value.rows.length > 0, `${path}.rows`);
  if (!Array.isArray(value?.rows) || !positiveInteger(totalParticipants)) return;

  let participantTotal = 0;
  let protectedRows = 0;
  const identities = new Set();
  value.rows.forEach((row, index) => {
    const rowPath = `${path}.rows.${index}`;
    add(errors, exactKeys(row, EXECUTIVE_RANKING_ROW_KEYS), `${rowPath}.shape`);
    if (row?.privacyStatus === 'released') {
      add(errors,
        safeCode(row?.companyCode) && safeCode(row?.sourceCode) &&
          safeLabel(row?.label, 160) && row.label !== GRH_PROTECTED_BUCKET_LABEL,
        `${rowPath}.identity`);
      // Downstream cohort routes address a released category by company + source code.
      // A label change must not make the same route identity appear twice.
      const identity = `${String(row?.companyCode)}:${String(row?.sourceCode)}`;
      add(errors, !identities.has(identity), `${rowPath}.unique`);
      identities.add(identity);
    } else if (row?.privacyStatus === 'protected_aggregate') {
      protectedRows += 1;
      add(errors,
        row?.companyCode === null && row?.sourceCode === null &&
          row?.label === GRH_PROTECTED_BUCKET_LABEL,
        `${rowPath}.protectedIdentity`);
    } else {
      add(errors, false, `${rowPath}.privacyStatus`);
    }
    add(errors,
      nonNegativeInteger(row?.participants) && row.participants >= threshold &&
        row.participants <= totalParticipants,
      `${rowPath}.participants`);
    if (nonNegativeInteger(row?.participants)) {
      participantTotal += row.participants;
      add(errors, row?.participantDisplay === String(row.participants), `${rowPath}.participantDisplay`);
      add(errors,
        finitePercentage(row?.sharePct) &&
          row.sharePct === expectedShare(row.participants, totalParticipants),
        `${rowPath}.sharePct`);
    }
  });
  add(errors, participantTotal === totalParticipants, `${path}.participantReconciliation`);
  add(errors, protectedRows <= 1, `${path}.protectedRows`);
  add(errors,
    value?.privacyStatus === (protectedRows === 0 ? 'released' : 'partially_suppressed'),
    `${path}.statusReconciliation`);
}

function validatePayrollCohort(value, errors) {
  add(errors, exactKeys(value, PAYROLL_COHORT_KEYS), 'payrollCohort.shape');
  add(errors, safeLabel(value?.definition, 500), 'payrollCohort.definition');
  add(errors, /^\d{4}-(?:0[1-9]|1[0-2])$/u.test(value?.referencePeriod || ''),
    'payrollCohort.referencePeriod');
  add(errors, positiveInteger(value?.payrollParticipants), 'payrollCohort.payrollParticipants');
  for (const property of ['bySector', 'byCostCenter', 'byAgreement']) {
    validateExecutiveRanking(
      value?.[property],
      `payrollCohort.${property}`,
      value?.payrollParticipants,
      errors,
    );
  }
}

function validateActivityDomain(value, property, source, errors) {
  const path = `activity.${property}`;
  const expectedTable = property === 'absence' ? 'ausencia' : 'legamov';
  add(errors, exactKeys(value, ACTIVITY_DOMAIN_KEYS), `${path}.shape`);
  add(errors, value?.sourceTable === expectedTable, `${path}.sourceTable`);
  add(errors, value?.metric === 'valid_rows_by_year', `${path}.metric`);
  add(errors, Array.isArray(value?.series) && value.series.length > 0, `${path}.series`);
  if (!Array.isArray(value?.series)) return;

  const snapshotYear = Number(String(source?.snapshotAsOf || '').slice(0, 4));
  const periods = new Set();
  let suppressedRows = 0;
  value.series.forEach((row, index) => {
    const rowPath = `${path}.series.${index}`;
    add(errors, exactKeys(row, ACTIVITY_SERIES_ROW_KEYS), `${rowPath}.shape`);
    const periodIsSafe = /^\d{4}$/u.test(row?.period || '');
    if (row?.period !== null) {
      add(errors,
        periodIsSafe && !periods.has(row.period) && Number(row.period) <= snapshotYear,
        `${rowPath}.period`);
      periods.add(row.period);
    }
    if (row?.privacyStatus === 'released') {
      add(errors, periodIsSafe, `${rowPath}.releasedPeriod`);
      add(errors,
        nonNegativeInteger(row?.participantCount) &&
          row.participantCount >= GRH_PRIVACY_THRESHOLDS.sensitive,
        `${rowPath}.smallCell`);
      add(errors,
        nonNegativeInteger(row?.value) && row.value >= row?.participantCount,
        `${rowPath}.value`);
      add(errors,
        row?.participantDisplay === String(row?.participantCount),
        `${rowPath}.participantDisplay`);
    } else if (row?.privacyStatus === 'suppressed') {
      suppressedRows += 1;
      add(errors, row?.period === null, `${rowPath}.suppressedPeriod`);
      add(errors, row?.participantCount === null, `${rowPath}.suppressedParticipantCount`);
      add(errors, row?.value === null, `${rowPath}.suppressedValue`);
      add(errors, row?.participantDisplay === 'Protegido', `${rowPath}.suppressedDisplay`);
    } else {
      add(errors, false, `${rowPath}.privacyStatus`);
    }
  });
  add(errors, suppressedRows === 0 || suppressedRows >= 2, `${path}.complementarySuppression`);
}

function validateSectorPayrollIsolation(sectors, payrollCohort, errors) {
  if (!Array.isArray(sectors?.rows) || !Array.isArray(payrollCohort?.bySector?.rows)) return;
  const payrollByCode = new Map();
  for (const row of payrollCohort.bySector.rows) {
    if (row?.privacyStatus !== 'released' || !safeCode(row?.sourceCode) ||
        !nonNegativeInteger(row?.participants)) continue;
    const code = String(row.sourceCode);
    payrollByCode.set(code, (payrollByCode.get(code) || 0) + row.participants);
  }
  for (const row of sectors.rows) {
    if (row?.privacyStatus !== 'released' || !nonNegativeInteger(row?.registeredRecords)) continue;
    const participants = payrollByCode.get(String(row.code));
    if (participants === undefined) continue;
    const complement = row.registeredRecords - participants;
    add(errors, complement >= 0, `payrollCohort.bySector.${String(row.code)}.registeredBounds`);
    add(errors,
      complement === 0 || complement >= GRH_ORGANIZATION_ANALYTICS_THRESHOLD,
      `payrollCohort.bySector.${String(row.code)}.complementaryPrivacy`);
  }
}

function validateActivity(value, source, errors) {
  add(errors, exactKeys(value, ACTIVITY_KEYS), 'activity.shape');
  validateActivityDomain(value?.absence, 'absence', source, errors);
  validateActivityDomain(value?.movements, 'movements', source, errors);
}

function validateAxis(rows, path, errors) {
  add(errors, Array.isArray(rows) && rows.length > 0 && rows.length <= 8, `${path}.array`);
  if (!Array.isArray(rows)) return new Set();
  const codes = new Set();
  rows.forEach((row, index) => {
    add(errors, exactKeys(row, MATRIX_AXIS_KEYS), `${path}.${index}.shape`);
    add(errors, nonNegativeInteger(row?.code), `${path}.${index}.code`);
    add(errors, safeLabel(row?.label), `${path}.${index}.label`);
    add(errors, !codes.has(row?.code), `${path}.${index}.unique`);
    codes.add(row?.code);
  });
  return codes;
}

function validateMatrix(matrix, errors) {
  add(errors, exactKeys(matrix, MATRIX_KEYS), 'matrix.shape');
  add(errors, matrix?.rowDimension === 'organization', 'matrix.rowDimension');
  add(errors, matrix?.columnDimension === 'sector', 'matrix.columnDimension');
  const rowCodes = validateAxis(matrix?.rows, 'matrix.rows', errors);
  const columnCodes = validateAxis(matrix?.columns, 'matrix.columns', errors);
  add(errors, Array.isArray(matrix?.cells), 'matrix.cells.array');
  if (!Array.isArray(matrix?.cells)) return;
  add(errors, matrix.cells.length === rowCodes.size * columnCodes.size, 'matrix.cells.length');
  const seen = new Set();
  let released = 0;
  let protectedCount = 0;
  let maximum = 0;
  const rowUnknown = new Map([...rowCodes].map(code => [code, 0]));
  const columnUnknown = new Map([...columnCodes].map(code => [code, 0]));
  matrix.cells.forEach((cell, index) => {
    const path = `matrix.cells.${index}`;
    add(errors, exactKeys(cell, MATRIX_CELL_KEYS), `${path}.shape`);
    add(errors, rowCodes.has(cell?.organizationCode), `${path}.organizationCode`);
    add(errors, columnCodes.has(cell?.sectorCode), `${path}.sectorCode`);
    const key = `${cell?.organizationCode}:${cell?.sectorCode}`;
    add(errors, !seen.has(key), `${path}.unique`);
    seen.add(key);
    add(errors, MATRIX_PRIVACY_STATUSES.has(cell?.privacyStatus), `${path}.privacyStatus`);
    if (cell?.privacyStatus === 'released') {
      released += 1;
      add(errors,
        nonNegativeInteger(cell.registeredRecords) &&
          cell.registeredRecords >= GRH_ORGANIZATION_ANALYTICS_THRESHOLD,
        `${path}.registeredRecords.released`);
      if (nonNegativeInteger(cell.registeredRecords)) maximum = Math.max(maximum, cell.registeredRecords);
    } else if (cell?.privacyStatus === 'not_observed') {
      add(errors, cell.registeredRecords === 0, `${path}.registeredRecords.zero`);
    } else {
      protectedCount += 1;
      add(errors, cell?.registeredRecords === null, `${path}.registeredRecords.protected`);
      rowUnknown.set(cell.organizationCode, (rowUnknown.get(cell.organizationCode) || 0) + 1);
      columnUnknown.set(cell.sectorCode, (columnUnknown.get(cell.sectorCode) || 0) + 1);
    }
  });
  add(errors, released === matrix?.releasedCellCount, 'matrix.releasedCellCount');
  add(errors, protectedCount === matrix?.protectedCellCount, 'matrix.protectedCellCount');
  add(errors, maximum === matrix?.maxReleasedRecords, 'matrix.maxReleasedRecords');
  for (const [code, count] of rowUnknown) add(errors, count !== 1, `matrix.rowComplement.${code}`);
  for (const [code, count] of columnUnknown) add(errors, count !== 1, `matrix.columnComplement.${code}`);
}

function validateDataQuality(value, coverage, source, errors) {
  add(errors, exactKeys(value, DATA_QUALITY_KEYS), 'dataQuality.shape');
  const integerKeys = DATA_QUALITY_KEYS.filter(key => !key.endsWith('Date'));
  for (const key of integerKeys) add(errors, nonNegativeInteger(value?.[key]), `dataQuality.${key}`);
  const total = coverage?.registeredRecords;
  add(errors,
    value?.missingOrganizationRecords === total - coverage?.withOrganization?.records,
    'dataQuality.missingOrganizationRecords.identity');
  add(errors,
    value?.missingSectorRecords === total - coverage?.withSector?.records,
    'dataQuality.missingSectorRecords.identity');
  add(errors,
    coverage?.withOrganizationAndSector?.records ===
      total - value?.missingOrganizationRecords - value?.missingSectorRecords + value?.missingBothRecords,
    'dataQuality.missingBothRecords.identity');
  add(errors,
    value?.linkedAbsenceEvents === coverage?.absenceEvents,
    'dataQuality.linkedAbsenceEvents.identity');
  add(errors,
    value?.validAbsenceEvents === value?.linkedAbsenceEvents + value?.unlinkedValidAbsenceEvents,
    'dataQuality.validAbsenceEvents.identity');
  add(errors, value?.codedPositionRecords <= total, 'dataQuality.codedPositionRecords.bound');
  add(errors, value?.positionObservationRecords <= total, 'dataQuality.positionObservationRecords.bound');
  add(errors,
    value?.futureEffectivePositionObservationRecords <= value?.positionObservationRecords,
    'dataQuality.futurePosition.bound');
  const hasFuture = value?.futureEffectivePositionObservationRecords > 0;
  add(errors,
    hasFuture ? DATE_PATTERN.test(value?.firstFuturePositionDate || '') : value?.firstFuturePositionDate === null,
    'dataQuality.firstFuturePositionDate');
  add(errors,
    hasFuture ? DATE_PATTERN.test(value?.lastFuturePositionDate || '') : value?.lastFuturePositionDate === null,
    'dataQuality.lastFuturePositionDate');
  if (hasFuture) {
    add(errors, value.firstFuturePositionDate > source?.snapshotAsOf, 'dataQuality.futureAfterSnapshot.first');
    add(errors, value.lastFuturePositionDate >= value.firstFuturePositionDate, 'dataQuality.futureDateOrder');
  }
}

function validateActions(actions, errors) {
  add(errors, Array.isArray(actions), 'actions.array');
  if (!Array.isArray(actions)) return;
  add(errors, actions.length === GRH_ORGANIZATION_ANALYTICS_ACTIONS.length, 'actions.length');
  actions.forEach((action, index) => {
    add(errors, exactKeys(action, ACTION_KEYS), `actions.${index}.shape`);
    add(errors,
      JSON.stringify(action) === JSON.stringify(GRH_ORGANIZATION_ANALYTICS_ACTIONS[index]),
      `actions.${index}.allowlist`);
  });
}

export function inspectGrhOrganizationAnalyticsContract(value, {
  expectedSourceSha256 = null,
  expectedSnapshotAsOf = null,
} = {}) {
  const errors = [];
  add(errors, exactKeys(value, TOP_LEVEL_KEYS), 'contract.shape');
  add(errors,
    value?.schemaVersion === GRH_ORGANIZATION_ANALYTICS_SCHEMA_VERSION,
    'contract.schemaVersion');
  validateSource(value?.source, errors);
  validatePrivacy(value?.privacy, errors);
  validateCoverage(value?.coverage, errors);
  validateDimension(value?.organizations, 'organization', value?.coverage, errors);
  validateDimension(value?.sectors, 'sector', value?.coverage, errors);
  validateMatrix(value?.matrix, errors);
  validateAbsenceRanking(value?.absenceRanking, value?.coverage, errors);
  validatePayrollCohort(value?.payrollCohort, errors);
  validateSectorPayrollIsolation(value?.sectors, value?.payrollCohort, errors);
  validateActivity(value?.activity, value?.source, errors);
  validateDataQuality(value?.dataQuality, value?.coverage, value?.source, errors);
  validateActions(value?.actions, errors);
  add(errors,
    JSON.stringify(value?.limits) === JSON.stringify(GRH_ORGANIZATION_ANALYTICS_LIMITS),
    'limits.allowlist');
  add(errors,
    expectedSourceSha256 === null ||
      (SHA256_PATTERN.test(expectedSourceSha256) && value?.source?.sourceSha256 === expectedSourceSha256),
    'source.expectedSha256');
  add(errors,
    expectedSnapshotAsOf === null ||
      (DATE_PATTERN.test(expectedSnapshotAsOf) && value?.source?.snapshotAsOf === expectedSnapshotAsOf),
    'source.expectedSnapshotAsOf');
  for (const path of forbiddenKeyPaths(value)) errors.push(`pii_key.${path}`);
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze([...new Set(errors)]),
  });
}
