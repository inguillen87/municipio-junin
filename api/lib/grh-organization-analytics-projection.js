import { inspectGrhDirectoryArtifact } from './grh-directory-contract.js';
import { buildGrhExecutiveProjection } from './grh-executive-projection.js';
import {
  GRH_ORGANIZATION_ANALYTICS_ACTIONS,
  GRH_ORGANIZATION_ANALYTICS_LIMITS,
  GRH_ORGANIZATION_ANALYTICS_PROTECTED_LABEL,
  GRH_ORGANIZATION_ANALYTICS_SCHEMA_VERSION,
  GRH_ORGANIZATION_ANALYTICS_THRESHOLD,
  inspectGrhOrganizationAnalyticsContract,
} from './grh-organization-analytics-contract.js';

const DEFAULT_RANKING_LIMIT = 12;
const DEFAULT_ABSENCE_RANKING_LIMIT = 10;
const DEFAULT_MATRIX_AXIS_LIMIT = 5;
const ABSENCE_PRIVACY_PROTECTED = 'protected';
const ABSENCE_PRIVACY_RELEASED = 'released';

function analyticsError(code, details = []) {
  const error = new TypeError('La analitica organizacional GRH no esta disponible.');
  error.code = code;
  error.details = Object.freeze([...details]);
  return error;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function safeDimensionLabel(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200 &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function round4(value) {
  return Number(value.toFixed(4));
}

function sharePct(value, denominator) {
  return denominator === 0 ? 0 : round4((value / denominator) * 100);
}

function eventsPerRegisteredRecord(events, registeredRecords) {
  return registeredRecords === 0 ? 0 : round4(events / registeredRecords);
}

function coverageMetric(records, total) {
  return {
    records,
    sharePct: sharePct(records, total),
  };
}

function compareGroups(metric) {
  return (left, right) => (
    right[metric] - left[metric] ||
    right.registeredRecords - left.registeredRecords ||
    String(left.label || '').localeCompare(String(right.label || ''), 'es', { sensitivity: 'variant' }) ||
    String(left.code ?? '').localeCompare(String(right.code ?? ''), 'en', { numeric: true })
  );
}

function groupRecords(records, dimension, { includeMissing = false } = {}) {
  const grouped = new Map();
  for (const record of records) {
    const value = record[dimension];
    if (!value && !includeMissing) continue;
    const key = value ? `code:${value.code}` : '__missing__';
    const label = value?.label === null || value?.label === undefined ? null : String(value.label).trim();
    const current = grouped.get(key) || {
      code: value?.code ?? null,
      label,
      forceProtected: !value || !safeDimensionLabel(label),
      registeredRecords: 0,
      recordsWithAbsence: 0,
      absenceEvents: 0,
    };
    if (value && (current.code !== value.code || current.label !== label)) {
      throw analyticsError('GRH_ORGANIZATION_ANALYTICS_DIMENSION_CONFLICT', [dimension, key]);
    }
    current.registeredRecords += 1;
    const absenceEvents = record?.absence?.event_count;
    if (!nonNegativeInteger(absenceEvents)) {
      throw analyticsError('GRH_ORGANIZATION_ANALYTICS_ABSENCE_INVALID', [dimension, key]);
    }
    if (absenceEvents > 0) current.recordsWithAbsence += 1;
    current.absenceEvents += absenceEvents;
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

function moveSmallestVisible(visible, protectedGroups, metric) {
  if (visible.length === 0) return false;
  visible.sort((left, right) => (
    left[metric] - right[metric] ||
    left.registeredRecords - right.registeredRecords ||
    String(right.label || '').localeCompare(String(left.label || ''), 'es', { sensitivity: 'variant' })
  ));
  protectedGroups.push(visible.shift());
  return true;
}

function protectedMetricTotal(groups, metric) {
  return groups.reduce((total, group) => total + group[metric], 0);
}

function completeProtectedGroup(visible, protectedGroups, metric) {
  if (protectedGroups.length === 0) return;
  while (
    visible.length > 0 &&
    (protectedGroups.length < 2 ||
      protectedMetricTotal(protectedGroups, metric) < GRH_ORGANIZATION_ANALYTICS_THRESHOLD)
  ) {
    moveSmallestVisible(visible, protectedGroups, metric);
  }
}

function partitionGroups(groups, { metric, limit }) {
  const visible = groups.filter(group => (
    !group.forceProtected && group[metric] >= GRH_ORGANIZATION_ANALYTICS_THRESHOLD
  ));
  const protectedGroups = groups.filter(group => (
    group.forceProtected || group[metric] < GRH_ORGANIZATION_ANALYTICS_THRESHOLD
  ));
  completeProtectedGroup(visible, protectedGroups, metric);
  visible.sort(compareGroups(metric));
  if (visible.length > limit) protectedGroups.push(...visible.splice(limit));
  completeProtectedGroup(visible, protectedGroups, metric);
  visible.sort(compareGroups(metric));
  return { visible, protectedGroups };
}

function aggregateGroups(groups) {
  return groups.reduce((aggregate, group) => ({
    code: null,
    label: GRH_ORGANIZATION_ANALYTICS_PROTECTED_LABEL,
    forceProtected: true,
    registeredRecords: aggregate.registeredRecords + group.registeredRecords,
    recordsWithAbsence: aggregate.recordsWithAbsence + group.recordsWithAbsence,
    absenceEvents: aggregate.absenceEvents + group.absenceEvents,
  }), {
    code: null,
    label: GRH_ORGANIZATION_ANALYTICS_PROTECTED_LABEL,
    forceProtected: true,
    registeredRecords: 0,
    recordsWithAbsence: 0,
    absenceEvents: 0,
  });
}

function analyticsRow(group, {
  privacyStatus,
  shareDenominator,
  shareMode = 'records',
  publishAbsence = false,
} = {}) {
  const absenceReleased = publishAbsence &&
    group.recordsWithAbsence >= GRH_ORGANIZATION_ANALYTICS_THRESHOLD;
  const shareValue = shareMode === 'events' ? group.absenceEvents : group.registeredRecords;
  return {
    code: privacyStatus === 'released' ? group.code : null,
    label: privacyStatus === 'released' ? group.label : GRH_ORGANIZATION_ANALYTICS_PROTECTED_LABEL,
    registeredRecords: group.registeredRecords,
    sharePct: absenceReleased || shareMode === 'records'
      ? sharePct(shareValue, shareDenominator)
      : null,
    recordsWithAbsence: absenceReleased ? group.recordsWithAbsence : null,
    absenceEvents: absenceReleased ? group.absenceEvents : null,
    eventsPerRegisteredRecord: absenceReleased
      ? eventsPerRegisteredRecord(group.absenceEvents, group.registeredRecords)
      : null,
    absencePrivacyStatus: absenceReleased ? ABSENCE_PRIVACY_RELEASED : ABSENCE_PRIVACY_PROTECTED,
    privacyStatus,
  };
}

function buildDimension(records, dimension, limit = DEFAULT_RANKING_LIMIT) {
  const groups = groupRecords(records, dimension);
  const denominatorRecords = groups.reduce((total, group) => total + group.registeredRecords, 0);
  if (denominatorRecords < GRH_ORGANIZATION_ANALYTICS_THRESHOLD || groups.length === 0) {
    throw analyticsError('GRH_ORGANIZATION_ANALYTICS_DIMENSION_PROTECTED', [dimension]);
  }
  const { visible, protectedGroups } = partitionGroups(groups, {
    metric: 'registeredRecords',
    limit,
  });
  const rows = visible.map(group => analyticsRow(group, {
    privacyStatus: 'released',
    shareDenominator: denominatorRecords,
  }));
  if (protectedGroups.length > 0) {
    const protectedAggregate = aggregateGroups(protectedGroups);
    if (protectedAggregate.registeredRecords < GRH_ORGANIZATION_ANALYTICS_THRESHOLD) {
      throw analyticsError('GRH_ORGANIZATION_ANALYTICS_COMPLEMENTARY_SUPPRESSION_FAILED', [dimension]);
    }
    rows.push(analyticsRow(protectedAggregate, {
      privacyStatus: protectedGroups.length >= 2 ? 'protected_aggregate' : 'suppressed',
      shareDenominator: denominatorRecords,
    }));
  }
  return {
    dimension,
    denominatorRecords,
    categoryCount: groups.length,
    releasedCategoryCount: visible.length,
    protectedCategoryCount: protectedGroups.length,
    rows,
  };
}

function protectSectorDimensionAgainstPayroll(sectors, payrollRanking) {
  const payrollByCode = new Map();
  for (const row of payrollRanking?.rows || []) {
    if (row?.privacyStatus !== 'released' || row?.sourceCode === null ||
        !nonNegativeInteger(row?.participants)) continue;
    const code = String(row.sourceCode);
    payrollByCode.set(code, (payrollByCode.get(code) || 0) + row.participants);
  }

  const releasedRows = sectors.rows.filter(row => row.privacyStatus === 'released');
  const existingProtected = sectors.rows.find(row => row.code === null) || null;
  const protectedCodes = new Set();
  for (const row of releasedRows) {
    const participants = payrollByCode.get(String(row.code));
    if (participants === undefined) continue;
    const complement = row.registeredRecords - participants;
    if (complement < 0) {
      throw analyticsError('GRH_ORGANIZATION_ANALYTICS_SECTOR_COHORT_MISMATCH', [String(row.code)]);
    }
    if (complement > 0 && complement < GRH_ORGANIZATION_ANALYTICS_THRESHOLD) {
      protectedCodes.add(row.code);
    }
  }
  if (protectedCodes.size === 0) return sectors;

  if (!existingProtected && protectedCodes.size === 1) {
    const companion = releasedRows
      .filter(row => !protectedCodes.has(row.code))
      .sort((left, right) => (
        left.registeredRecords - right.registeredRecords ||
        String(left.code).localeCompare(String(right.code), 'en', { numeric: true })
      ))[0];
    if (!companion) {
      throw analyticsError('GRH_ORGANIZATION_ANALYTICS_SECTOR_COMPLEMENT_FAILED');
    }
    protectedCodes.add(companion.code);
  }

  const moved = releasedRows.filter(row => protectedCodes.has(row.code));
  const kept = releasedRows.filter(row => !protectedCodes.has(row.code));
  const protectedRecords = (existingProtected?.registeredRecords || 0) +
    moved.reduce((total, row) => total + row.registeredRecords, 0);
  if (protectedRecords < GRH_ORGANIZATION_ANALYTICS_THRESHOLD) {
    throw analyticsError('GRH_ORGANIZATION_ANALYTICS_SECTOR_COMPLEMENT_FAILED');
  }
  const protectedRow = {
    code: null,
    label: GRH_ORGANIZATION_ANALYTICS_PROTECTED_LABEL,
    registeredRecords: protectedRecords,
    sharePct: sharePct(protectedRecords, sectors.denominatorRecords),
    recordsWithAbsence: null,
    absenceEvents: null,
    eventsPerRegisteredRecord: null,
    absencePrivacyStatus: ABSENCE_PRIVACY_PROTECTED,
    privacyStatus: 'protected_aggregate',
  };
  return {
    ...sectors,
    releasedCategoryCount: kept.length,
    protectedCategoryCount: sectors.protectedCategoryCount + moved.length,
    rows: [...kept, protectedRow],
  };
}

function protectActivityDomain(domain) {
  if (!Array.isArray(domain?.series) || domain.series.length === 0) {
    throw analyticsError('GRH_ORGANIZATION_ANALYTICS_ACTIVITY_INVALID');
  }
  const rows = domain.series.map(row => ({ ...row }));
  const suppressed = rows.filter(row => row.privacyStatus === 'suppressed');
  if (suppressed.length === 1) {
    const companion = rows
      .filter(row => row.privacyStatus === 'released')
      .sort((left, right) => (
        left.participantCount - right.participantCount || String(left.period).localeCompare(String(right.period))
      ))[0];
    if (!companion) {
      throw analyticsError('GRH_ORGANIZATION_ANALYTICS_ACTIVITY_COMPLEMENT_FAILED');
    }
    companion.privacyStatus = 'suppressed';
  }
  return {
    sourceTable: domain.sourceTable,
    metric: domain.metric,
    series: rows.map(row => row.privacyStatus === 'suppressed' ? {
      period: null,
      value: null,
      participantCount: null,
      participantDisplay: 'Protegido',
      privacyStatus: 'suppressed',
    } : row),
  };
}

function buildAbsenceRanking(records) {
  const groups = groupRecords(records, 'organization', { includeMissing: true });
  const denominatorRecords = records.length;
  const recordsWithAbsence = groups.reduce((total, group) => total + group.recordsWithAbsence, 0);
  const absenceEvents = groups.reduce((total, group) => total + group.absenceEvents, 0);
  if (recordsWithAbsence < GRH_ORGANIZATION_ANALYTICS_THRESHOLD ||
      absenceEvents < recordsWithAbsence) {
    throw analyticsError('GRH_ORGANIZATION_ANALYTICS_ABSENCE_PROTECTED');
  }
  const { visible, protectedGroups } = partitionGroups(groups, {
    metric: 'recordsWithAbsence',
    limit: DEFAULT_ABSENCE_RANKING_LIMIT,
  });
  const rows = visible.map(group => analyticsRow(group, {
    privacyStatus: 'released',
    shareDenominator: absenceEvents,
    shareMode: 'events',
    publishAbsence: true,
  }));
  if (protectedGroups.length > 0) {
    const protectedAggregate = aggregateGroups(protectedGroups);
    if (protectedGroups.length < 2 ||
        protectedAggregate.recordsWithAbsence < GRH_ORGANIZATION_ANALYTICS_THRESHOLD) {
      throw analyticsError('GRH_ORGANIZATION_ANALYTICS_ABSENCE_COMPLEMENT_FAILED');
    }
    rows.push(analyticsRow(protectedAggregate, {
      privacyStatus: 'protected_aggregate',
      shareDenominator: absenceEvents,
      shareMode: 'events',
      publishAbsence: true,
    }));
  }
  return {
    historical: true,
    denominatorRecords,
    recordsWithAbsence,
    absenceEvents,
    rows,
  };
}

function isProtectedMatrixStatus(status) {
  return status === 'primary_suppressed' || status === 'complementary_suppressed';
}

function protectComplementaryMatrixCells(cells, rowCodes, columnCodes) {
  const protectOne = (axis, code) => {
    const members = cells.filter(cell => cell[axis] === code);
    const unknown = members.filter(cell => isProtectedMatrixStatus(cell.privacyStatus));
    if (unknown.length !== 1) return false;
    const released = members
      .filter(cell => cell.privacyStatus === 'released')
      .sort((left, right) => left.rawRecords - right.rawRecords);
    const candidate = released[0] || members.find(cell => cell.privacyStatus === 'not_observed');
    if (!candidate) {
      throw analyticsError('GRH_ORGANIZATION_ANALYTICS_MATRIX_COMPLEMENT_FAILED', [axis, String(code)]);
    }
    candidate.privacyStatus = 'complementary_suppressed';
    return true;
  };

  let changed = true;
  let passes = 0;
  while (changed && passes <= cells.length) {
    changed = false;
    passes += 1;
    for (const code of rowCodes) changed = protectOne('organizationCode', code) || changed;
    for (const code of columnCodes) changed = protectOne('sectorCode', code) || changed;
  }
  if (passes > cells.length) {
    throw analyticsError('GRH_ORGANIZATION_ANALYTICS_MATRIX_COMPLEMENT_DID_NOT_CONVERGE');
  }
}

function combinations(values, size) {
  if (values.length <= size) return [[...values]];
  const output = [];
  const selected = [];
  const visit = start => {
    if (selected.length === size) {
      output.push([...selected]);
      return;
    }
    const remaining = size - selected.length;
    for (let index = start; index <= values.length - remaining; index += 1) {
      selected.push(values[index]);
      visit(index + 1);
      selected.pop();
    }
  };
  visit(0);
  return output;
}

function matrixSelectionScore(rows, columns, counts) {
  let releasedCells = 0;
  let releasedRecords = 0;
  for (const row of rows) {
    for (const column of columns) {
      const count = counts.get(`${row.code}:${column.code}`) || 0;
      if (count >= GRH_ORGANIZATION_ANALYTICS_THRESHOLD) {
        releasedCells += 1;
        releasedRecords += count;
      }
    }
  }
  return { releasedCells, releasedRecords };
}

function compareDimensionCodes(left, right) {
  return String(left.code).localeCompare(String(right.code), 'en', { numeric: true });
}

function betterMatrixSelection(left, right) {
  if (!right) return true;
  if (left.score.releasedCells !== right.score.releasedCells) {
    return left.score.releasedCells > right.score.releasedCells;
  }
  if (left.score.releasedRecords !== right.score.releasedRecords) {
    return left.score.releasedRecords > right.score.releasedRecords;
  }
  const leftKey = [
    ...left.rows.map(row => row.code).sort((a, b) => String(a).localeCompare(String(b), 'en', { numeric: true })),
    '|',
    ...left.columns.map(column => column.code).sort((a, b) => String(a).localeCompare(String(b), 'en', { numeric: true })),
  ].join(':');
  const rightKey = [
    ...right.rows.map(row => row.code).sort((a, b) => String(a).localeCompare(String(b), 'en', { numeric: true })),
    '|',
    ...right.columns.map(column => column.code).sort((a, b) => String(a).localeCompare(String(b), 'en', { numeric: true })),
  ].join(':');
  return leftKey.localeCompare(rightKey, 'en', { numeric: true }) < 0;
}

function selectMatrixAxes(organizationCandidates, sectorCandidates, counts) {
  const stableOrganizations = [...organizationCandidates].sort(compareDimensionCodes);
  const stableSectors = [...sectorCandidates].sort(compareDimensionCodes);
  const rowLimit = Math.min(DEFAULT_MATRIX_AXIS_LIMIT, stableOrganizations.length);
  const columnLimit = Math.min(DEFAULT_MATRIX_AXIS_LIMIT, stableSectors.length);
  let best = null;
  for (const rowCombination of combinations(stableOrganizations, rowLimit)) {
    const rankedColumns = stableSectors.map(column => {
      const score = matrixSelectionScore(rowCombination, [column], counts);
      return { column, score };
    }).sort((left, right) => (
      right.score.releasedCells - left.score.releasedCells ||
      right.score.releasedRecords - left.score.releasedRecords ||
      compareDimensionCodes(left.column, right.column)
    ));
    const selectedCodes = new Set(rankedColumns.slice(0, columnLimit).map(item => item.column.code));
    const selectedColumns = stableSectors.filter(column => selectedCodes.has(column.code));
    const candidate = {
      rows: rowCombination,
      columns: selectedColumns,
      score: matrixSelectionScore(rowCombination, selectedColumns, counts),
    };
    if (betterMatrixSelection(candidate, best)) best = candidate;
  }
  return best;
}

function buildMatrix(records, organizations, sectors) {
  const organizationCandidates = organizations.rows
    .filter(row => row.privacyStatus === 'released')
    .map(row => ({ code: row.code, label: row.label }));
  const sectorCandidates = sectors.rows
    .filter(row => row.privacyStatus === 'released')
    .map(row => ({ code: row.code, label: row.label }));
  if (organizationCandidates.length === 0 || sectorCandidates.length === 0) {
    throw analyticsError('GRH_ORGANIZATION_ANALYTICS_MATRIX_AXES_PROTECTED');
  }
  const candidateRowCodes = new Set(organizationCandidates.map(row => row.code));
  const candidateColumnCodes = new Set(sectorCandidates.map(column => column.code));
  const counts = new Map();
  for (const record of records) {
    const organizationCode = record.organization?.code;
    const sectorCode = record.sector?.code;
    if (!candidateRowCodes.has(organizationCode) || !candidateColumnCodes.has(sectorCode)) continue;
    const key = `${organizationCode}:${sectorCode}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const selection = selectMatrixAxes(organizationCandidates, sectorCandidates, counts);
  const rows = selection.rows;
  const columns = selection.columns;
  const rowCodes = new Set(rows.map(row => row.code));
  const columnCodes = new Set(columns.map(column => column.code));
  const cells = [];
  for (const row of rows) {
    for (const column of columns) {
      const rawRecords = counts.get(`${row.code}:${column.code}`) || 0;
      cells.push({
        organizationCode: row.code,
        sectorCode: column.code,
        rawRecords,
        privacyStatus: rawRecords === 0
          ? 'not_observed'
          : rawRecords < GRH_ORGANIZATION_ANALYTICS_THRESHOLD
            ? 'primary_suppressed'
            : 'released',
      });
    }
  }
  protectComplementaryMatrixCells(cells, rowCodes, columnCodes);
  const outputCells = cells.map(cell => ({
    organizationCode: cell.organizationCode,
    sectorCode: cell.sectorCode,
    registeredRecords: isProtectedMatrixStatus(cell.privacyStatus) ? null : cell.rawRecords,
    privacyStatus: cell.privacyStatus,
  }));
  const releasedValues = outputCells
    .filter(cell => cell.privacyStatus === 'released')
    .map(cell => cell.registeredRecords);
  return {
    rowDimension: 'organization',
    columnDimension: 'sector',
    rows,
    columns,
    cells: outputCells,
    releasedCellCount: releasedValues.length,
    protectedCellCount: outputCells.filter(cell => isProtectedMatrixStatus(cell.privacyStatus)).length,
    maxReleasedRecords: releasedValues.length > 0 ? Math.max(...releasedValues) : 0,
  };
}

function buildDataQuality(artifact, records, coverage) {
  const missingOrganizationRecords = records.filter(record => !record.organization).length;
  const missingSectorRecords = records.filter(record => !record.sector).length;
  const missingBothRecords = records.filter(record => !record.organization && !record.sector).length;
  const positionObservations = records.filter(record => record.position_observation);
  const futurePositionObservations = positionObservations.filter(record => (
    record.position_observation.status === 'source_future_effective'
  ));
  const futureDates = futurePositionObservations
    .map(record => record.position_observation.observed_date)
    .sort();
  const linkedAbsenceEvents = coverage.absenceEvents;
  const validAbsenceEvents = artifact.counts.valid_absence_events;
  if (linkedAbsenceEvents > validAbsenceEvents) {
    throw analyticsError('GRH_ORGANIZATION_ANALYTICS_ABSENCE_RECONCILIATION_FAILED');
  }
  return {
    missingOrganizationRecords,
    missingSectorRecords,
    missingBothRecords,
    invalidEmployeeKeyRows: artifact.counts.invalid_employee_key_rows,
    unmatchedPersonRecords: records.length - artifact.counts.person_matches,
    validAbsenceEvents,
    quarantinedAbsenceEvents: artifact.counts.quarantined_absence_events,
    linkedAbsenceEvents,
    unlinkedValidAbsenceEvents: validAbsenceEvents - linkedAbsenceEvents,
    codedPositionRecords: records.filter(record => record.position).length,
    positionObservationRecords: positionObservations.length,
    futureEffectivePositionObservationRecords: futurePositionObservations.length,
    firstFuturePositionDate: futureDates[0] || null,
    lastFuturePositionDate: futureDates[futureDates.length - 1] || null,
  };
}

function buildCoverage(records) {
  const registeredRecords = records.length;
  const withOrganization = records.filter(record => record.organization).length;
  const withSector = records.filter(record => record.sector).length;
  const withOrganizationAndSector = records.filter(record => record.organization && record.sector).length;
  const withAbsenceHistory = records.filter(record => record.absence.event_count > 0).length;
  const absenceEvents = records.reduce((total, record) => total + record.absence.event_count, 0);
  return {
    registeredRecords,
    withOrganization: coverageMetric(withOrganization, registeredRecords),
    withSector: coverageMetric(withSector, registeredRecords),
    withOrganizationAndSector: coverageMetric(withOrganizationAndSector, registeredRecords),
    withAbsenceHistory: coverageMetric(withAbsenceHistory, registeredRecords),
    absenceEvents,
  };
}

function assertSourceIdentity(artifact, semantic, executive) {
  const semanticSource = semantic?.source;
  const executiveSource = executive?.source;
  if (
    semanticSource?.file !== artifact.source.file ||
    semanticSource?.sha256 !== artifact.source.sha256 ||
    semanticSource?.snapshot_as_of !== artifact.source.snapshot_as_of ||
    semanticSource?.canonical_system !== artifact.source.canonical_system ||
    executiveSource?.sourceFile !== artifact.source.file ||
    executiveSource?.sourceSha256 !== artifact.source.sha256 ||
    executiveSource?.snapshotAsOf !== artifact.source.snapshot_as_of ||
    executiveSource?.canonicalSystem !== artifact.source.canonical_system
  ) {
    throw analyticsError('GRH_ORGANIZATION_ANALYTICS_SOURCE_IDENTITY_MISMATCH');
  }
}

export function buildGrhOrganizationAnalyticsProjection(artifact, semantic, {
  buildExecutiveProjectionImpl = buildGrhExecutiveProjection,
} = {}) {
  const artifactInspection = inspectGrhDirectoryArtifact(artifact);
  if (!artifactInspection.ok) {
    throw analyticsError('GRH_ORGANIZATION_ANALYTICS_SOURCE_INVALID', artifactInspection.errors);
  }
  const records = artifact.records;
  if (records.length < GRH_ORGANIZATION_ANALYTICS_THRESHOLD) {
    throw analyticsError('GRH_ORGANIZATION_ANALYTICS_SOURCE_PROTECTED');
  }
  const executive = buildExecutiveProjectionImpl(semantic, { audience: 'portable' });
  assertSourceIdentity(artifact, semantic, executive);
  const coverage = buildCoverage(records);
  const organizations = buildDimension(records, 'organization');
  const sectors = protectSectorDimensionAgainstPayroll(
    buildDimension(records, 'sector'),
    executive.workforce.bySector,
  );
  const projection = {
    schemaVersion: GRH_ORGANIZATION_ANALYTICS_SCHEMA_VERSION,
    source: {
      canonicalSystem: artifact.source.canonical_system,
      sourceFile: artifact.source.file,
      sourceSha256: artifact.source.sha256,
      snapshotAsOf: artifact.source.snapshot_as_of,
    },
    privacy: {
      threshold: GRH_ORGANIZATION_ANALYTICS_THRESHOLD,
      containsPii: false,
      identifiersExported: false,
      labelsProtectedBeforeRanking: true,
      complementarySuppression: true,
    },
    coverage,
    organizations,
    sectors,
    matrix: buildMatrix(records, organizations, sectors),
    absenceRanking: buildAbsenceRanking(records),
    payrollCohort: {
      definition: executive.workforce.definition,
      referencePeriod: executive.workforce.referencePeriod,
      payrollParticipants: executive.workforce.payrollParticipants,
      bySector: executive.workforce.bySector,
      byCostCenter: executive.workforce.byCostCenter,
      byAgreement: executive.workforce.byAgreement,
    },
    activity: {
      absence: protectActivityDomain(executive.absence),
      movements: protectActivityDomain(executive.movements),
    },
    dataQuality: buildDataQuality(artifact, records, coverage),
    actions: GRH_ORGANIZATION_ANALYTICS_ACTIONS.map(action => ({ ...action })),
    limits: [...GRH_ORGANIZATION_ANALYTICS_LIMITS],
  };
  const inspection = inspectGrhOrganizationAnalyticsContract(projection, {
    expectedSourceSha256: semantic.source.sha256,
    expectedSnapshotAsOf: semantic.source.snapshot_as_of,
  });
  if (!inspection.ok) {
    throw analyticsError('GRH_ORGANIZATION_ANALYTICS_PROJECTION_INVALID', inspection.errors);
  }
  return deepFreeze(projection);
}
