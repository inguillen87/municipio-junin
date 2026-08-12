import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createGrhOrganizationAnalyticsHandler,
  GRH_ORGANIZATION_ANALYTICS_RESOURCE,
  readEncryptedGrhDirectorySnapshot,
} from '../api/grh-organization-analytics.js';
import {
  GRH_DIRECTORY_EXCLUDED_FIELDS,
  inspectGrhDirectoryArtifact,
} from '../api/lib/grh-directory-contract.js';
import {
  createGrhDirectorySnapshotEnvelope,
} from '../api/lib/grh-directory-snapshot.js';
import {
  GRH_ORGANIZATION_ANALYTICS_ACTIONS,
  GRH_ORGANIZATION_ANALYTICS_LIMITS,
  GRH_ORGANIZATION_ANALYTICS_PROTECTED_LABEL,
  GRH_ORGANIZATION_ANALYTICS_SCHEMA_VERSION,
  inspectGrhOrganizationAnalyticsContract,
} from '../api/lib/grh-organization-analytics-contract.js';
import {
  buildGrhOrganizationAnalyticsProjection,
} from '../api/lib/grh-organization-analytics-projection.js';

const SOURCE_SHA = 'a'.repeat(64);
const PRIVATE_ARTIFACT_PATH =
  'C:/Users/guill/AppData/Local/MuniControl/private/grh-directory.json';

function record({ index, organization, sector, absenceEvents = 0 }) {
  return {
    company_code: 101,
    legajo: 1000 + index,
    display_name: `Persona privada ${index}`,
    sector: { code: sector.code, label: sector.label },
    cost_center: { code: 2, label: 'CENTRO DE COSTO' },
    organization: { code: organization.code, label: organization.label },
    position: null,
    category: { code: 3, label: 'Categoría gobernada' },
    agreement: { code: 2, label: 'Convenio gobernado' },
    absence: {
      event_count: absenceEvents,
      latest_date: absenceEvents > 0 ? `2026-08-${String(absenceEvents).padStart(2, '0')}` : null,
    },
    absence_history: Array.from({ length: absenceEvents }, (_, eventIndex) => ({
      date: `2026-08-${String(eventIndex + 1).padStart(2, '0')}`,
      days: 1,
    })).reverse(),
    leave: {
      event_count: 0,
      latest_start_date: null,
      latest_end_date: null,
    },
    leave_history: [],
    movement: { row_count: 0, period_count: 0, latest_period: null },
    movement_history: [],
    position_observation: null,
  };
}

function artifactFixture() {
  const organizations = {
    a: { code: 1, label: 'ORGANIZACIÓN A' },
    b: { code: 2, label: 'ORGANIZACIÓN B' },
    c: { code: 3, label: 'ORGANIZACIÓN PROTEGIDA C' },
    d: { code: 4, label: 'ORGANIZACIÓN D' },
    e: { code: 5, label: 'ORGANIZACIÓN PROTEGIDA E' },
  };
  const sectors = {
    x: { code: 10, label: 'SECTOR X' },
    y: { code: 20, label: 'SECTOR Y' },
    z: { code: 30, label: 'SECTOR Z' },
  };
  const records = [];
  let index = 0;
  const append = (organization, sector, count, absencePeople, eventsPerPerson) => {
    for (let offset = 0; offset < count; offset += 1) {
      index += 1;
      records.push(record({
        index,
        organization,
        sector,
        absenceEvents: offset < absencePeople ? eventsPerPerson : 0,
      }));
    }
  };
  append(organizations.a, sectors.x, 12, 12, 2);
  append(organizations.a, sectors.y, 5, 0, 0);
  append(organizations.a, sectors.z, 7, 0, 0);
  append(organizations.b, sectors.x, 5, 5, 3);
  append(organizations.b, sectors.y, 15, 4, 3);
  append(organizations.c, sectors.z, 9, 5, 1);
  append(organizations.d, sectors.x, 11, 10, 4);
  append(organizations.e, sectors.y, 6, 5, 2);

  const absenceEvents = records.reduce((total, item) => total + item.absence.event_count, 0);
  return {
    schema_version: 'grh-directory-v2',
    source: {
      canonical_system: 'GRH Junín',
      file: 'grh_junin.backup_2026080615_plataforma.sql.gz',
      sha256: SOURCE_SHA,
      compressed_size_bytes: 44537741,
      snapshot_as_of: '2026-08-06',
      generated_at: '2026-08-10T15:00:00.000Z',
    },
    privacy: {
      contains_personal_data: true,
      private_storage_required: true,
      excluded_fields: [...GRH_DIRECTORY_EXCLUDED_FIELDS],
    },
    counts: {
      source_rows: {
        ausencia: absenceEvents,
        cargo: 0,
        catego: 1,
        convenio: 1,
        costos: 1,
        histolegajo: 0,
        legajo: records.length,
        legamov: 0,
        licencia: 0,
        organiza: 5,
        persona: records.length,
        sectores: 3,
      },
      directory_records: records.length,
      person_matches: records.length,
      records_with_name: records.length,
      records_without_name: 0,
      duplicate_person_links: 0,
      invalid_employee_key_rows: 0,
      valid_absence_events: absenceEvents,
      quarantined_absence_events: 0,
      valid_leave_events: 0,
      quarantined_leave_events: 0,
      valid_movement_rows: 0,
      quarantined_movement_rows: 0,
      valid_position_observation_rows: 0,
      blank_position_observation_rows: 0,
      quarantined_position_observation_rows: 0,
      future_effective_position_observation_rows: 0,
      records_with_position_observation: 0,
    },
    records,
  };
}

function semanticFixture(artifact = artifactFixture()) {
  return {
    source: {
      file: artifact.source.file,
      sha256: artifact.source.sha256,
      snapshot_as_of: artifact.source.snapshot_as_of,
      canonical_system: artifact.source.canonical_system,
      compressed_size_bytes: artifact.source.compressed_size_bytes,
    },
    workforce: {
      matched_legajo_participants: 68,
      legajo_match_rate_pct: 97.1429,
    },
  };
}

function executiveRanking(rows, totalParticipants = 70) {
  return {
    threshold: 10,
    totalParticipants,
    participantDisplay: String(totalParticipants),
    privacyStatus: 'released',
    rows: rows.map(([companyCode, sourceCode, label, participants]) => ({
      companyCode,
      sourceCode,
      label,
      participants,
      participantDisplay: String(participants),
      sharePct: Number(((participants / totalParticipants) * 100).toFixed(4)),
      privacyStatus: 'released',
    })),
  };
}

function executiveProjectionFixture(artifact = artifactFixture()) {
  return {
    source: {
      canonicalSystem: artifact.source.canonical_system,
      sourceFile: artifact.source.file,
      sourceSha256: artifact.source.sha256,
      snapshotAsOf: artifact.source.snapshot_as_of,
    },
    workforce: {
      definition: 'Participantes distintos en calculo valido; no dotacion contractual activa.',
      referencePeriod: '2026-07',
      payrollParticipants: 70,
      bySector: executiveRanking([
        [101, 1, 'Administrativo', 30],
        [101, 2, 'Servicios', 25],
        [101, 3, 'Operativo', 15],
      ]),
      byCostCenter: executiveRanking([
        [101, 10, 'Servicios publicos', 40],
        [101, 20, 'Gobierno', 20],
        [101, 30, 'Cultura', 10],
      ]),
      byAgreement: executiveRanking([
        [101, 100, 'Planta permanente', 50],
        [101, 200, 'Personal temporario', 20],
      ]),
    },
    absence: {
      sourceTable: 'ausencia',
      metric: 'valid_rows_by_year',
      series: [
        { period: '2024', value: 20, participantCount: 10, participantDisplay: '10', privacyStatus: 'released' },
        { period: '2025', value: 30, participantCount: 15, participantDisplay: '15', privacyStatus: 'released' },
        { period: '2026', value: null, participantCount: null, participantDisplay: '<10', privacyStatus: 'suppressed' },
      ],
    },
    movements: {
      sourceTable: 'legamov',
      metric: 'valid_rows_by_year',
      series: [
        { period: '2024', value: 140, participantCount: 20, participantDisplay: '20', privacyStatus: 'released' },
        { period: '2025', value: 180, participantCount: 25, participantDisplay: '25', privacyStatus: 'released' },
        { period: '2026', value: 210, participantCount: 30, participantDisplay: '30', privacyStatus: 'released' },
      ],
    },
  };
}

function bundleFixture(artifact = artifactFixture()) {
  return {
    profile: {
      source: artifact.source.file,
      sha256: artifact.source.sha256,
      snapshot_as_of: artifact.source.snapshot_as_of,
    },
    semantic: semanticFixture(artifact),
  };
}

function buildProjectionFixture(artifact = artifactFixture(), semantic = semanticFixture(artifact)) {
  return buildGrhOrganizationAnalyticsProjection(artifact, semantic, {
    buildExecutiveProjectionImpl: (_semantic, options) => {
      assert.deepEqual(options, { audience: 'portable' });
      return executiveProjectionFixture(artifact);
    },
  });
}

function matrixAxisPrivacyFixture({ smallIntersections = [] } = {}) {
  const organizations = Array.from({ length: 7 }, (_, index) => ({
    code: index + 1,
    label: `ORGANIZATION ${index + 1}`,
  }));
  const sectors = Array.from({ length: 7 }, (_, index) => ({
    code: (index + 1) * 10,
    label: `SECTOR ${index + 1}`,
  }));
  const records = [];
  let index = 0;
  for (let axis = 0; axis < 7; axis += 1) {
    for (let offset = 0; offset < 10; offset += 1) {
      index += 1;
      records.push(record({
        index,
        organization: organizations[axis],
        sector: sectors[axis],
        absenceEvents: 1,
      }));
    }
  }
  for (const { organizationCode, sectorCode, count } of smallIntersections) {
    assert.ok(count > 0 && count < 10);
    for (let offset = 0; offset < count; offset += 1) {
      index += 1;
      records.push(record({
        index,
        organization: organizations[organizationCode - 1],
        sector: sectors[(sectorCode / 10) - 1],
        absenceEvents: 0,
      }));
    }
  }

  const fixture = artifactFixture();
  fixture.records = records;
  fixture.counts = {
    ...fixture.counts,
    source_rows: {
      ...fixture.counts.source_rows,
      ausencia: 70,
      legajo: records.length,
      organiza: organizations.length,
      persona: records.length,
      sectores: sectors.length,
    },
    directory_records: records.length,
    person_matches: records.length,
    records_with_name: records.length,
    valid_absence_events: 70,
  };
  return fixture;
}

function crossViewDifferencingFixture() {
  const organizations = Array.from({ length: 11 }, (_, index) => ({
    code: index + 1,
    label: `ORGANIZATION ${index + 1}`,
  }));
  const sectors = Array.from({ length: 11 }, (_, index) => ({
    code: (index + 1) * 10,
    label: `SECTOR ${index + 1}`,
  }));
  const records = [];
  let index = 0;
  for (let axis = 0; axis < organizations.length; axis += 1) {
    for (let offset = 0; offset < 10; offset += 1) {
      index += 1;
      records.push(record({
        index,
        organization: organizations[axis],
        sector: sectors[axis],
        absenceEvents: axis < 10 || offset === 0 ? 1 : 0,
      }));
    }
  }

  const fixture = artifactFixture();
  fixture.records = records;
  fixture.counts = {
    ...fixture.counts,
    source_rows: {
      ...fixture.counts.source_rows,
      ausencia: 101,
      legajo: records.length,
      organiza: organizations.length,
      persona: records.length,
      sectores: sectors.length,
    },
    directory_records: records.length,
    person_matches: records.length,
    records_with_name: records.length,
    valid_absence_events: 101,
  };
  return fixture;
}

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

function withQuietErrors(callback) {
  const original = console.error;
  console.error = () => {};
  return Promise.resolve().then(callback).finally(() => { console.error = original; });
}

function protectedCountByAxis(matrix, axis, code) {
  return matrix.cells.filter(cell => (
    cell[axis] === code &&
    ['primary_suppressed', 'complementary_suppressed'].includes(cell.privacyStatus)
  )).length;
}

test('projection is exact, visualizable and removes every nominal field', () => {
  const artifact = artifactFixture();
  assert.equal(inspectGrhDirectoryArtifact(artifact).ok, true);
  const projection = buildProjectionFixture(artifact);
  assert.equal(inspectGrhOrganizationAnalyticsContract(projection).ok, true);
  assert.equal(projection.schemaVersion, GRH_ORGANIZATION_ANALYTICS_SCHEMA_VERSION);
  assert.deepEqual(projection.coverage, {
    registeredRecords: 70,
    withOrganization: { records: 70, sharePct: 100 },
    withSector: { records: 70, sharePct: 100 },
    withOrganizationAndSector: { records: 70, sharePct: 100 },
    withAbsenceHistory: { records: 41, sharePct: 58.5714 },
    absenceEvents: 106,
  });
  assert.equal(projection.organizations.categoryCount, 5);
  assert.equal(projection.organizations.releasedCategoryCount, 3);
  assert.equal(projection.organizations.protectedCategoryCount, 2);
  assert.equal(projection.organizations.rows.reduce((sum, row) => sum + row.registeredRecords, 0), 70);
  assert.equal(projection.sectors.rows.reduce((sum, row) => sum + row.registeredRecords, 0), 70);
  assert.deepEqual(Object.keys(projection.payrollCohort), [
    'definition',
    'referencePeriod',
    'payrollParticipants',
    'bySector',
    'byCostCenter',
    'byAgreement',
  ]);
  assert.equal(projection.payrollCohort.payrollParticipants, 70);
  assert.deepEqual(Object.keys(projection.activity), ['absence', 'movements']);
  assert.equal(projection.activity.absence.sourceTable, 'ausencia');
  assert.equal(projection.activity.movements.sourceTable, 'legamov');
  assert.equal(
    projection.activity.absence.series.filter(row => row.privacyStatus === 'suppressed').length,
    2,
  );
  assert.equal(projection.activity.absence.series
    .filter(row => row.privacyStatus === 'suppressed')
    .every(row => row.period === null && row.participantDisplay === 'Protegido'), true);
  assert.deepEqual(projection.actions, GRH_ORGANIZATION_ANALYTICS_ACTIONS);
  assert.deepEqual(projection.limits, GRH_ORGANIZATION_ANALYTICS_LIMITS);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.matrix.cells), true);

  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /Persona privada|"legajo"|"display_name"|"displayName"|"company_code"/i);
  assert.doesNotMatch(serialized, /"compensation"|"amounts"|"leave"|"licencia"/i);
  assert.doesNotMatch(serialized, /ORGANIZACIÓN PROTEGIDA [CE]/u);
  assert.match(serialized, new RegExp(GRH_ORGANIZATION_ANALYTICS_PROTECTED_LABEL));
});

test('absence metrics use distinct affected records and only the canonical ranking publishes them', () => {
  const projection = buildProjectionFixture();
  const organizationB = projection.organizations.rows.find(row => row.code === 2);
  assert.equal(organizationB.registeredRecords, 20);
  assert.equal(organizationB.absencePrivacyStatus, 'protected');
  assert.equal(organizationB.recordsWithAbsence, null);
  assert.equal(organizationB.absenceEvents, null);
  assert.equal(organizationB.eventsPerRegisteredRecord, null);

  const organizationA = projection.organizations.rows.find(row => row.code === 1);
  assert.equal(organizationA.absencePrivacyStatus, 'protected');
  assert.equal(organizationA.recordsWithAbsence, null);
  assert.equal(organizationA.absenceEvents, null);
  assert.equal(organizationA.eventsPerRegisteredRecord, null);

  const organizationAAbsence = projection.absenceRanking.rows.find(row => row.code === 1);
  assert.equal(organizationAAbsence.recordsWithAbsence, 12);
  assert.equal(organizationAAbsence.absenceEvents, 24);
  assert.equal(organizationAAbsence.eventsPerRegisteredRecord, 1);

  assert.equal(projection.absenceRanking.recordsWithAbsence, 41);
  assert.equal(projection.absenceRanking.absenceEvents, 106);
  assert.equal(
    projection.absenceRanking.rows.reduce((sum, row) => sum + row.recordsWithAbsence, 0),
    41,
  );
  assert.equal(
    projection.absenceRanking.rows.reduce((sum, row) => sum + row.absenceEvents, 0),
    106,
  );
  assert.equal(projection.absenceRanking.rows.every(row => row.recordsWithAbsence >= 10), true);
  assert.equal(projection.absenceRanking.rows.some(row => row.privacyStatus === 'protected_aggregate'), true);
});

test('cross-view differencing cannot recover a below-k organization absence count', () => {
  const projection = buildProjectionFixture(crossViewDifferencingFixture());
  assert.equal(inspectGrhOrganizationAnalyticsContract(projection).ok, true);
  for (const dimension of [projection.organizations, projection.sectors]) {
    assert.equal(dimension.rows.every(row => (
      row.absencePrivacyStatus === 'protected' &&
      row.recordsWithAbsence === null &&
      row.absenceEvents === null &&
      row.eventsPerRegisteredRecord === null
    )), true);
  }

  const publishedOrganizationCodes = new Set(
    projection.organizations.rows.filter(row => row.code !== null).map(row => row.code),
  );
  const absenceCodes = new Set(
    projection.absenceRanking.rows.filter(row => row.code !== null).map(row => row.code),
  );
  const hiddenFromAbsenceRanking = [...publishedOrganizationCodes]
    .filter(code => !absenceCodes.has(code));
  const protectedAbsence = projection.absenceRanking.rows.find(row => row.code === null);
  assert.equal(hiddenFromAbsenceRanking.length, 2);
  assert.equal(protectedAbsence.recordsWithAbsence, 11);
  assert.equal(protectedAbsence.absenceEvents, 11);

  const attemptedDisclosure = structuredClone(projection);
  const hiddenDimensionRow = attemptedDisclosure.organizations.rows
    .find(row => hiddenFromAbsenceRanking.includes(row.code));
  hiddenDimensionRow.absencePrivacyStatus = 'released';
  hiddenDimensionRow.recordsWithAbsence = 1;
  hiddenDimensionRow.absenceEvents = 1;
  hiddenDimensionRow.eventsPerRegisteredRecord = 0.1;
  assert.equal(inspectGrhOrganizationAnalyticsContract(attemptedDisclosure).ok, false);
});

test('matrix emits the full cross product and complementary suppression leaves no single unknown margin', () => {
  const projection = buildProjectionFixture();
  const { matrix } = projection;
  assert.equal(matrix.cells.length, matrix.rows.length * matrix.columns.length);
  assert.equal(matrix.cells.some(cell => cell.privacyStatus === 'not_observed' && cell.registeredRecords === 0), true);
  assert.equal(matrix.cells.some(cell => cell.privacyStatus === 'primary_suppressed' && cell.registeredRecords === null), true);
  assert.equal(matrix.cells.some(cell => cell.privacyStatus === 'complementary_suppressed' && cell.registeredRecords === null), true);
  for (const row of matrix.rows) {
    assert.notEqual(protectedCountByAxis(matrix, 'organizationCode', row.code), 1);
  }
  for (const column of matrix.columns) {
    assert.notEqual(protectedCountByAxis(matrix, 'sectorCode', column.code), 1);
  }

  const missingCell = structuredClone(projection);
  missingCell.matrix.cells.pop();
  assert.equal(inspectGrhOrganizationAnalyticsContract(missingCell).ok, false);

  const inferredMargin = structuredClone(projection);
  const row = inferredMargin.matrix.rows.find(candidate => (
    protectedCountByAxis(inferredMargin.matrix, 'organizationCode', candidate.code) >= 2
  ));
  const protectedCells = inferredMargin.matrix.cells.filter(cell => (
    cell.organizationCode === row.code &&
    ['primary_suppressed', 'complementary_suppressed'].includes(cell.privacyStatus)
  ));
  for (const cell of protectedCells.slice(1)) {
    cell.privacyStatus = 'not_observed';
    cell.registeredRecords = 0;
    inferredMargin.matrix.protectedCellCount -= 1;
  }
  assert.equal(protectedCountByAxis(inferredMargin.matrix, 'organizationCode', row.code), 1);
  assert.equal(inspectGrhOrganizationAnalyticsContract(inferredMargin).ok, false);
});

test('matrix axes and released cells do not reveal changes among protected intersections', () => {
  const first = buildProjectionFixture(matrixAxisPrivacyFixture());
  const second = buildProjectionFixture(matrixAxisPrivacyFixture({
    smallIntersections: [
      { organizationCode: 1, sectorCode: 20, count: 1 },
      { organizationCode: 1, sectorCode: 30, count: 2 },
      { organizationCode: 2, sectorCode: 10, count: 3 },
      { organizationCode: 2, sectorCode: 30, count: 4 },
      { organizationCode: 3, sectorCode: 10, count: 5 },
      { organizationCode: 3, sectorCode: 20, count: 6 },
    ],
  }));
  const releasedCells = projection => projection.matrix.cells
    .filter(cell => cell.privacyStatus === 'released')
    .map(cell => ({
      organizationCode: cell.organizationCode,
      sectorCode: cell.sectorCode,
      registeredRecords: cell.registeredRecords,
    }));

  assert.deepEqual(first.matrix.rows, second.matrix.rows);
  assert.deepEqual(first.matrix.columns, second.matrix.columns);
  assert.deepEqual(releasedCells(first), releasedCells(second));
  assert.deepEqual(first.matrix.rows.map(row => row.code), [1, 2, 3, 4, 5]);
  assert.deepEqual(first.matrix.columns.map(column => column.code), [10, 20, 30, 40, 50]);
});

test('contract rejects shape drift, PII keys, bad denominators and protected absence disclosure', () => {
  const projection = buildProjectionFixture();

  const pii = structuredClone(projection);
  pii.organizations.rows[0].legajo = 1234;
  assert.equal(inspectGrhOrganizationAnalyticsContract(pii).ok, false);

  const denominator = structuredClone(projection);
  denominator.coverage.withOrganization.records -= 1;
  assert.equal(inspectGrhOrganizationAnalyticsContract(denominator).ok, false);

  const absenceDisclosure = structuredClone(projection);
  const protectedRow = absenceDisclosure.organizations.rows.find(row => row.absencePrivacyStatus === 'protected');
  protectedRow.recordsWithAbsence = 9;
  protectedRow.absenceEvents = 27;
  protectedRow.eventsPerRegisteredRecord = 1.35;
  assert.equal(inspectGrhOrganizationAnalyticsContract(absenceDisclosure).ok, false);

  const quality = structuredClone(projection);
  quality.dataQuality.unlinkedValidAbsenceEvents += 1;
  assert.equal(inspectGrhOrganizationAnalyticsContract(quality).ok, false);

  const cohortExtraKey = structuredClone(projection);
  cohortExtraKey.payrollCohort.bySector.rows[0].rawLabel = 'no permitido';
  assert.equal(inspectGrhOrganizationAnalyticsContract(cohortExtraKey).ok, false);

  const cohortSmallCell = structuredClone(projection);
  cohortSmallCell.payrollCohort.bySector.rows[0].participants = 9;
  cohortSmallCell.payrollCohort.bySector.rows[0].participantDisplay = '9';
  assert.equal(inspectGrhOrganizationAnalyticsContract(cohortSmallCell).ok, false);

  const cohortTotalDrift = structuredClone(projection);
  cohortTotalDrift.payrollCohort.byCostCenter.rows[0].participants -= 1;
  assert.equal(inspectGrhOrganizationAnalyticsContract(cohortTotalDrift).ok, false);

  const cohortRouteIdentityCollision = structuredClone(projection);
  const firstCostCenter = cohortRouteIdentityCollision.payrollCohort.byCostCenter.rows[0];
  const secondCostCenter = cohortRouteIdentityCollision.payrollCohort.byCostCenter.rows[1];
  secondCostCenter.companyCode = firstCostCenter.companyCode;
  secondCostCenter.sourceCode = firstCostCenter.sourceCode;
  assert.notEqual(secondCostCenter.label, firstCostCenter.label);
  assert.equal(inspectGrhOrganizationAnalyticsContract(cohortRouteIdentityCollision).ok, false);

  const cohortMatchDisclosure = structuredClone(projection);
  cohortMatchDisclosure.payrollCohort.matchedLegajoParticipants = 68;
  assert.equal(inspectGrhOrganizationAnalyticsContract(cohortMatchDisclosure).ok, false);

  const sectorDifferenceDisclosure = structuredClone(projection);
  const sectorRow = sectorDifferenceDisclosure.sectors.rows.find(row => row.code !== null);
  const firstPayrollRow = sectorDifferenceDisclosure.payrollCohort.bySector.rows[0];
  const secondPayrollRow = sectorDifferenceDisclosure.payrollCohort.bySector.rows[1];
  const previousFirstParticipants = firstPayrollRow.participants;
  const disclosedParticipants = sectorRow.registeredRecords - 1;
  const shiftedParticipants = previousFirstParticipants - disclosedParticipants;
  firstPayrollRow.sourceCode = sectorRow.code;
  firstPayrollRow.participants = disclosedParticipants;
  firstPayrollRow.participantDisplay = String(disclosedParticipants);
  firstPayrollRow.sharePct = Number((disclosedParticipants / 70 * 100).toFixed(4));
  secondPayrollRow.participants += shiftedParticipants;
  secondPayrollRow.participantDisplay = String(secondPayrollRow.participants);
  secondPayrollRow.sharePct = Number((secondPayrollRow.participants / 70 * 100).toFixed(4));
  assert.equal(inspectGrhOrganizationAnalyticsContract(sectorDifferenceDisclosure).ok, false);

  const activitySmallCell = structuredClone(projection);
  activitySmallCell.activity.movements.series[0].participantCount = 9;
  activitySmallCell.activity.movements.series[0].participantDisplay = '9';
  assert.equal(inspectGrhOrganizationAnalyticsContract(activitySmallCell).ok, false);

  const singleSuppressedPeriod = structuredClone(projection);
  const suppressedRows = singleSuppressedPeriod.activity.absence.series
    .filter(row => row.privacyStatus === 'suppressed');
  suppressedRows[0].period = '2024';
  suppressedRows[0].value = 20;
  suppressedRows[0].participantCount = 10;
  suppressedRows[0].participantDisplay = '10';
  suppressedRows[0].privacyStatus = 'released';
  assert.equal(inspectGrhOrganizationAnalyticsContract(singleSuppressedPeriod).ok, false);

  const protectedPeriodDisclosure = structuredClone(projection);
  protectedPeriodDisclosure.activity.absence.series
    .find(row => row.privacyStatus === 'suppressed').period = '2026';
  assert.equal(inspectGrhOrganizationAnalyticsContract(protectedPeriodDisclosure).ok, false);

  const amountReinjection = structuredClone(projection);
  amountReinjection.activity.absence.series[0].amounts = { grossCents: 1 };
  assert.equal(inspectGrhOrganizationAnalyticsContract(amountReinjection).ok, false);

  const leaveReinjection = structuredClone(projection);
  leaveReinjection.activity.leave = projection.activity.absence;
  assert.equal(inspectGrhOrganizationAnalyticsContract(leaveReinjection).ok, false);

  const sourceDrift = structuredClone(projection);
  sourceDrift.source.sourceSha256 = 'b'.repeat(64);
  assert.equal(inspectGrhOrganizationAnalyticsContract(sourceDrift, {
    expectedSourceSha256: SOURCE_SHA,
    expectedSnapshotAsOf: '2026-08-06',
  }).ok, false);

  const snapshotDrift = structuredClone(projection);
  snapshotDrift.source.snapshotAsOf = '2026-08-05';
  assert.equal(inspectGrhOrganizationAnalyticsContract(snapshotDrift, {
    expectedSourceSha256: SOURCE_SHA,
    expectedSnapshotAsOf: '2026-08-06',
  }).ok, false);
});

test('encrypted snapshot helper derives the projection source without a plaintext runtime fallback', async () => {
  const artifact = artifactFixture();
  const tenantId = 'tenant-junin';
  const key = Buffer.alloc(32, 7).toString('base64url');
  const envelope = createGrhDirectorySnapshotEnvelope({
    tenantId,
    artifact,
    key,
    nonce: Buffer.alloc(12, 3),
  });
  let queryCount = 0;
  const loaded = await readEncryptedGrhDirectorySnapshot({
    tenantId,
    environment: { GRH_DIRECTORY_SNAPSHOT_KEY_V1: key },
    queryImpl: async (sql, values) => {
      queryCount += 1;
      assert.match(sql, /FROM audit_logs/);
      assert.equal(values[0], tenantId);
      return { rows: [{ details: envelope }] };
    },
  });
  assert.equal(queryCount, 1);
  assert.equal(loaded.source.sha256, SOURCE_SHA);
  assert.equal(loaded.records.length, 70);
  assert.equal(Object.isFrozen(loaded), true);
});

test('endpoint is GET-only, tenant-bound, capability-bound, no-store and exact-contract', async () => {
  const artifact = artifactFixture();
  const calls = [];
  const handler = createGrhOrganizationAnalyticsHandler({
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      calls.push(['capability', resource, action]);
      return { id: 'pilot', role: 'INTENDENTE', tenantId: 'tenant-junin' };
    },
    requireDatasetTenantImpl: (_res, caller, envName) => {
      calls.push(['tenant', caller.tenantId, envName]);
      return true;
    },
    readSnapshotArtifactImpl: async ({ tenantId }) => {
      calls.push(['read', tenantId]);
      return artifact;
    },
    readArtifactBundleImpl: async tenantId => {
      calls.push(['bundle', tenantId]);
      return bundleFixture(artifact);
    },
    inspectProfileImpl: () => ({ ok: true, errors: [] }),
    inspectSemanticImpl: () => ({ ok: true, errors: [] }),
    buildProjectionImpl: (directory, semantic) => buildProjectionFixture(directory, semantic),
    environment: {
      GRH_SOURCE_SHA256: SOURCE_SHA,
      GRH_DIRECTORY_SNAPSHOT_KEY_V1: 'unused-by-injected-reader',
    },
  });
  const response = responseRecorder();
  await handler({ method: 'GET', headers: {}, query: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.schemaVersion, GRH_ORGANIZATION_ANALYTICS_SCHEMA_VERSION);
  assert.equal(response.headers['x-municontrol-contract'], GRH_ORGANIZATION_ANALYTICS_SCHEMA_VERSION);
  assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(response.headers['pragma'], 'no-cache');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers.vary, 'Authorization');
  assert.deepEqual(calls, [
    ['capability', GRH_ORGANIZATION_ANALYTICS_RESOURCE, 'read'],
    ['tenant', 'tenant-junin', 'GRH_TENANT_ID'],
    ['read', 'tenant-junin'],
    ['bundle', 'tenant-junin'],
  ]);

  let authCalled = false;
  const methodHandler = createGrhOrganizationAnalyticsHandler({
    requireCapabilityImpl: async () => { authCalled = true; return null; },
  });
  const methodResponse = responseRecorder();
  await methodHandler({ method: 'POST', headers: {} }, methodResponse);
  assert.equal(methodResponse.statusCode, 405);
  assert.equal(methodResponse.headers.allow, 'GET');
  assert.equal(authCalled, false);
});

test('endpoint fails closed before reading on denied identity and on every invalid source/contract state', async () => {
  const artifact = artifactFixture();
  let reads = 0;
  let bundleReads = 0;
  const denied = createGrhOrganizationAnalyticsHandler({
    requireCapabilityImpl: async (_req, res) => {
      res.status(403).json({ code: 'ROUTE_PERMISSION_DENIED' });
      return null;
    },
    readSnapshotArtifactImpl: async () => { reads += 1; return artifact; },
    readArtifactBundleImpl: async () => { bundleReads += 1; return bundleFixture(artifact); },
  });
  const deniedResponse = responseRecorder();
  await denied({ method: 'GET', headers: {} }, deniedResponse);
  assert.equal(deniedResponse.statusCode, 403);
  assert.equal(reads, 0);
  assert.equal(bundleReads, 0);

  for (const scenario of [
    {
      name: 'pin mismatch',
      environment: { GRH_SOURCE_SHA256: 'b'.repeat(64) },
      reader: async () => artifact,
    },
    {
      name: 'invalid artifact',
      environment: { GRH_SOURCE_SHA256: SOURCE_SHA },
      reader: async () => ({ ...artifact, records: [] }),
    },
    {
      name: 'reader unavailable',
      environment: { GRH_SOURCE_SHA256: SOURCE_SHA },
      reader: async () => { throw new Error('private failure detail'); },
    },
    {
      name: 'semantic sha mismatch',
      environment: { GRH_SOURCE_SHA256: SOURCE_SHA },
      reader: async () => artifact,
      bundleReader: async () => {
        const bundle = bundleFixture(artifact);
        bundle.semantic.source.sha256 = 'b'.repeat(64);
        return bundle;
      },
    },
    {
      name: 'semantic snapshot mismatch',
      environment: { GRH_SOURCE_SHA256: SOURCE_SHA },
      reader: async () => artifact,
      bundleReader: async () => {
        const bundle = bundleFixture(artifact);
        bundle.semantic.source.snapshot_as_of = '2026-08-05';
        return bundle;
      },
    },
    {
      name: 'semantic contract invalid',
      environment: { GRH_SOURCE_SHA256: SOURCE_SHA },
      reader: async () => artifact,
      inspectSemantic: () => ({ ok: false, errors: ['semantic.invalid'] }),
    },
    {
      name: 'profile contract invalid',
      environment: { GRH_SOURCE_SHA256: SOURCE_SHA },
      reader: async () => artifact,
      inspectProfile: () => ({ ok: false, errors: ['profile.invalid'] }),
    },
  ]) {
    await withQuietErrors(async () => {
      const handler = createGrhOrganizationAnalyticsHandler({
        requireCapabilityImpl: async () => ({ id: 'pilot', role: 'INTENDENTE', tenantId: 'tenant-junin' }),
        requireDatasetTenantImpl: () => true,
        readSnapshotArtifactImpl: scenario.reader,
        readArtifactBundleImpl: scenario.bundleReader || (async () => bundleFixture(artifact)),
        inspectProfileImpl: scenario.inspectProfile || (() => ({ ok: true, errors: [] })),
        inspectSemanticImpl: scenario.inspectSemantic || (() => ({ ok: true, errors: [] })),
        buildProjectionImpl: (directory, semantic) => buildProjectionFixture(directory, semantic),
        environment: scenario.environment,
      });
      const response = responseRecorder();
      await handler({ method: 'GET', headers: {} }, response);
      assert.equal(response.statusCode, 503, scenario.name);
      assert.deepEqual(response.payload, {
        error: 'La analitica organizacional GRH no esta disponible.',
        code: 'GRH_ORGANIZATION_ANALYTICS_UNAVAILABLE',
      }, scenario.name);
      assert.doesNotMatch(JSON.stringify(response.payload), /private failure detail|Persona privada/i);
    });
  }
});

test('current private snapshot reconciles the verified aggregate baseline without emitting nominal rows', {
  skip: !existsSync(PRIVATE_ARTIFACT_PATH),
}, async (context) => {
  const artifact = JSON.parse(await readFile(PRIVATE_ARTIFACT_PATH, 'utf8'));
  const artifactInspection = inspectGrhDirectoryArtifact(artifact);
  if (!artifactInspection.ok) {
    context.skip('The installed private snapshot predates grh-directory-v2.');
    return;
  }
  const semantic = JSON.parse(await readFile(
    new URL('../api/_data/grh-semantic.json', import.meta.url),
    'utf8',
  ));
  const projection = buildGrhOrganizationAnalyticsProjection(artifact, semantic);
  assert.equal(inspectGrhOrganizationAnalyticsContract(projection).ok, true);
  assert.equal(projection.coverage.registeredRecords, 2449);
  assert.equal(projection.coverage.withOrganization.records, 1735);
  assert.equal(projection.coverage.withSector.records, 2152);
  assert.equal(projection.coverage.withAbsenceHistory.records, 1477);
  assert.equal(projection.coverage.absenceEvents, 31553);
  assert.equal(projection.dataQuality.linkedAbsenceEvents, 31553);
  assert.equal(projection.dataQuality.unlinkedValidAbsenceEvents, 6);
  assert.equal(projection.dataQuality.codedPositionRecords, 0);
  assert.equal(projection.dataQuality.futureEffectivePositionObservationRecords, 801);
  assert.equal(projection.matrix.rows.length, 5);
  assert.equal(projection.matrix.columns.length, 5);
  assert.equal(projection.matrix.cells.length, 25);
  const releasedCells = projection.matrix.cells.filter(cell => cell.privacyStatus === 'released');
  const protectedCells = projection.matrix.cells.filter(cell => (
    cell.privacyStatus === 'primary_suppressed' ||
    cell.privacyStatus === 'complementary_suppressed'
  ));
  assert.ok(releasedCells.length > 0);
  assert.equal(projection.matrix.releasedCellCount, releasedCells.length);
  assert.equal(projection.matrix.protectedCellCount, protectedCells.length);
  assert.equal(
    projection.matrix.maxReleasedRecords,
    Math.max(...releasedCells.map(cell => cell.registeredRecords)),
  );
  assert.equal(projection.matrix.cells.length, projection.matrix.rows.length * projection.matrix.columns.length);
  for (const row of projection.matrix.rows) {
    assert.notEqual(protectedCountByAxis(projection.matrix, 'organizationCode', row.code), 1);
  }
  for (const column of projection.matrix.columns) {
    assert.notEqual(protectedCountByAxis(projection.matrix, 'sectorCode', column.code), 1);
  }
  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /"display_name"|"displayName"|"legajo"|"company_code"/u);
  assert.doesNotMatch(serialized, /"compensation"|"amounts"|"leave"|"licencia"/u);
});
