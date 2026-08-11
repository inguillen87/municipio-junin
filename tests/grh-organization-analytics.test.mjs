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
    organization: { code: organization.code, label: organization.label },
    position: null,
    category: { code: 3, label: 'Categoría gobernada' },
    agreement: { code: 2, label: 'Convenio gobernado' },
    absence: {
      event_count: absenceEvents,
      latest_date: absenceEvents > 0 ? '2026-08-01' : null,
    },
    leave: {
      event_count: 0,
      latest_start_date: null,
      latest_end_date: null,
    },
    leave_history: [],
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
    schema_version: 'grh-directory-v1',
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
        histolegajo: 0,
        legajo: records.length,
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
      valid_position_observation_rows: 0,
      blank_position_observation_rows: 0,
      quarantined_position_observation_rows: 0,
      future_effective_position_observation_rows: 0,
      records_with_position_observation: 0,
    },
    records,
  };
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
  const projection = buildGrhOrganizationAnalyticsProjection(artifact);
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
  assert.deepEqual(projection.actions, GRH_ORGANIZATION_ANALYTICS_ACTIONS);
  assert.deepEqual(projection.limits, GRH_ORGANIZATION_ANALYTICS_LIMITS);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.matrix.cells), true);

  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /Persona privada|"legajo"|"display_name"|"displayName"|"company_code"|"companyCode"/i);
  assert.doesNotMatch(serialized, /ORGANIZACIÓN PROTEGIDA [CE]/u);
  assert.match(serialized, new RegExp(GRH_ORGANIZATION_ANALYTICS_PROTECTED_LABEL));
});

test('absence metrics use distinct affected records and only the canonical ranking publishes them', () => {
  const projection = buildGrhOrganizationAnalyticsProjection(artifactFixture());
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
  const projection = buildGrhOrganizationAnalyticsProjection(crossViewDifferencingFixture());
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
  const projection = buildGrhOrganizationAnalyticsProjection(artifactFixture());
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
  const first = buildGrhOrganizationAnalyticsProjection(matrixAxisPrivacyFixture());
  const second = buildGrhOrganizationAnalyticsProjection(matrixAxisPrivacyFixture({
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
  const projection = buildGrhOrganizationAnalyticsProjection(artifactFixture());

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
  const denied = createGrhOrganizationAnalyticsHandler({
    requireCapabilityImpl: async (_req, res) => {
      res.status(403).json({ code: 'ROUTE_PERMISSION_DENIED' });
      return null;
    },
    readSnapshotArtifactImpl: async () => { reads += 1; return artifact; },
  });
  const deniedResponse = responseRecorder();
  await denied({ method: 'GET', headers: {} }, deniedResponse);
  assert.equal(deniedResponse.statusCode, 403);
  assert.equal(reads, 0);

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
  ]) {
    await withQuietErrors(async () => {
      const handler = createGrhOrganizationAnalyticsHandler({
        requireCapabilityImpl: async () => ({ id: 'pilot', role: 'INTENDENTE', tenantId: 'tenant-junin' }),
        requireDatasetTenantImpl: () => true,
        readSnapshotArtifactImpl: scenario.reader,
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
}, async () => {
  const artifact = JSON.parse(await readFile(PRIVATE_ARTIFACT_PATH, 'utf8'));
  const projection = buildGrhOrganizationAnalyticsProjection(artifact);
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
  assert.doesNotMatch(serialized, /"display_name"|"displayName"|"legajo"|"company_code"|"companyCode"/u);
});
