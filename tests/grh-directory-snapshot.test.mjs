import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GRH_DIRECTORY_EXCLUDED_FIELDS,
  inspectGrhDirectoryArtifact,
  inspectGrhDirectoryResponse,
} from '../api/lib/grh-directory-contract.js';
import {
  clearGrhDirectorySnapshotCache,
  createGrhDirectorySnapshotEnvelope,
  decryptGrhDirectorySnapshotEnvelope,
  GRH_DIRECTORY_SNAPSHOT_ACTION,
  GRH_DIRECTORY_SNAPSHOT_ENTITY,
} from '../api/lib/grh-directory-snapshot.js';
import { readGrhDirectory } from '../api/lib/grh-directory-store.js';

const SNAPSHOT_KEY = Buffer.alloc(32, 7).toString('base64url');

function artifactFixture() {
  const records = [{
    company_code: 101,
    legajo: 1001,
    display_name: 'Ágata de Prueba',
    sector: { code: 7, label: 'Salud' },
    cost_center: { code: 60, label: 'Hospital' },
    organization: { code: 5, label: 'Hospital Municipal' },
    position: {
      code: 4,
      label: 'Directora',
      parent: { code: 40, label: 'Secretaría' },
      depends_on: { code: 50, label: 'Municipio' },
    },
    category: { code: 3, label: 'Categoría A' },
    agreement: { code: 2, label: 'Convenio municipal' },
    contract_regime: { code: 1, label: 'Planta permanente' },
    service_situation: { code: 1, label: 'Normal' },
    termination_reason: null,
    employment: {
      reported_ingress_date: '2000-01-01',
      reported_exit_date: null,
      reported_status: 'current_by_reported_dates',
      as_of: '2026-08-06',
      basis: 'legajo_reported_dates',
      reference_payroll_participation: { period: '2026-07', observed: true, row_count: 2 },
    },
    absence: { event_count: 2, latest_date: '2026-07-01' },
    absence_history: [
      { date: '2026-07-01', days: 1 },
      { date: '2026-06-01', days: 2 },
    ],
    leave: { event_count: 2, latest_start_date: '2026-05-01', latest_end_date: '2026-05-10' },
    leave_history: [
      { start_date: '2026-05-01', end_date: '2026-05-10', days: 10 },
      { start_date: '2025-02-01', end_date: '2025-02-02', days: 2 },
    ],
    movement: { row_count: 3, period_count: 2, latest_period: '2026-07' },
    movement_history: [
      { period: '2026-07', row_count: 2 },
      { period: '2026-06', row_count: 1 },
    ],
    position_observation: {
      label: 'Dirección observada',
      observed_date: '2026-08-31',
      observed_period: '2026-08',
      status: 'source_future_effective',
      source_table: 'histolegajo',
    },
  }, {
    company_code: 101,
    legajo: 1002,
    display_name: 'Bruno Operativo',
    sector: { code: 7, label: 'Salud' },
    cost_center: { code: 60, label: 'Hospital' },
    organization: { code: 6, label: 'Atención primaria' },
    position: { code: 8, label: 'Enfermero', parent: null, depends_on: null },
    category: { code: 4, label: 'Categoría B' },
    agreement: { code: 2, label: 'Convenio municipal' },
    contract_regime: { code: 2, label: 'Personal contratado' },
    service_situation: { code: 2, label: 'Licencia' },
    termination_reason: { code: 1, label: 'Renuncia' },
    employment: {
      reported_ingress_date: '2010-01-01',
      reported_exit_date: '2020-01-01',
      reported_status: 'ended_by_reported_dates',
      as_of: '2026-08-06',
      basis: 'legajo_reported_dates',
      reference_payroll_participation: { period: '2026-07', observed: false, row_count: 0 },
    },
    absence: { event_count: 0, latest_date: null },
    absence_history: [],
    leave: { event_count: 0, latest_start_date: null, latest_end_date: null },
    leave_history: [],
    movement: { row_count: 0, period_count: 0, latest_period: null },
    movement_history: [],
    position_observation: null,
  }, {
    company_code: 202,
    legajo: 1001,
    display_name: 'Celina Administración',
    sector: { code: 9, label: 'Administración' },
    cost_center: null,
    organization: null,
    position: null,
    category: null,
    agreement: null,
    contract_regime: null,
    service_situation: null,
    termination_reason: null,
    employment: {
      reported_ingress_date: null,
      reported_exit_date: null,
      reported_status: 'unknown_missing_ingress',
      as_of: '2026-08-06',
      basis: 'legajo_reported_dates',
      reference_payroll_participation: { period: '2026-07', observed: false, row_count: 0 },
    },
    absence: { event_count: 1, latest_date: '2026-01-05' },
    absence_history: [{ date: '2026-01-05', days: null }],
    leave: { event_count: 1, latest_start_date: '2024-04-01', latest_end_date: '2024-04-01' },
    leave_history: [{ start_date: '2024-04-01', end_date: '2024-04-01', days: 1 }],
    movement: { row_count: 1, period_count: 1, latest_period: '2025-12' },
    movement_history: [{ period: '2025-12', row_count: 1 }],
    position_observation: null,
  }];
  return {
    schema_version: 'grh-directory-v3',
    source: {
      canonical_system: 'GRH Junín',
      file: 'grh_junin.backup_2026080615_plataforma.sql.gz',
      sha256: 'a'.repeat(64),
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
        ausencia: 3,
        calculo: 3,
        cargo: 2,
        catego: 2,
        convenio: 1,
        costos: 2,
        histolegajo: 1,
        legajo: 3,
        legamov: 4,
        licencia: 3,
        motibaja: 1,
        organiza: 2,
        persona: 3,
        regcontr: 2,
        revista: 2,
        sectores: 2,
      },
      directory_records: 3,
      person_matches: 3,
      records_with_name: 3,
      records_without_name: 0,
      duplicate_person_links: 0,
      invalid_employee_key_rows: 0,
      valid_absence_events: 3,
      quarantined_absence_events: 0,
      valid_leave_events: 3,
      quarantined_leave_events: 0,
      valid_movement_rows: 4,
      quarantined_movement_rows: 0,
      valid_position_observation_rows: 1,
      blank_position_observation_rows: 0,
      quarantined_position_observation_rows: 0,
      future_effective_position_observation_rows: 1,
      records_with_position_observation: 1,
      valid_calculation_rows: 3,
      quarantined_calculation_rows: 0,
      reference_payroll_period: '2026-07',
      reference_payroll_rows: 2,
      records_observed_in_reference_payroll: 1,
      employment_statuses: {
        current_by_reported_dates: 1,
        ended_by_reported_dates: 1,
        invalid_chronology: 0,
        unknown_implausible_active_tenure: 0,
        unknown_missing_ingress: 1,
        unknown_sentinel_ingress: 0,
      },
    },
    records,
  };
}

function envelopeFixture({ tenantId = 'tenant-a', key = SNAPSHOT_KEY } = {}) {
  return createGrhDirectorySnapshotEnvelope({
    tenantId,
    artifact: artifactFixture(),
    key,
    nonce: Buffer.alloc(12, tenantId === 'tenant-a' ? 1 : 2),
  });
}

function snapshotQuery(envelope, expectedTenant = 'tenant-a') {
  return async (sql, values) => {
    assert.match(sql, /FROM audit_logs/);
    assert.doesNotMatch(sql, /grh_directory_people/);
    assert.deepEqual(values, [
      expectedTenant,
      GRH_DIRECTORY_SNAPSHOT_ACTION,
      GRH_DIRECTORY_SNAPSHOT_ENTITY,
    ]);
    return { rows: [{ details: envelope }] };
  };
}

test.beforeEach(() => clearGrhDirectorySnapshotCache());

test('v3 artifact rejects shape, cutoff, ordering and count identity drift', () => {
  const missingV2Fields = artifactFixture();
  delete missingV2Fields.records[0].movement;
  delete missingV2Fields.records[0].movement_history;
  assert.doesNotThrow(() => inspectGrhDirectoryArtifact(missingV2Fields));
  assert.equal(inspectGrhDirectoryArtifact(missingV2Fields).ok, false);

  const extraField = artifactFixture();
  extraField.records[0].movement_history[0].cause = 'forbidden';
  assert.ok(inspectGrhDirectoryArtifact(extraField).errors.includes(
    'records.0.movement_history.0.shape',
  ));

  const absenceOrder = artifactFixture();
  absenceOrder.records[0].absence_history.reverse();
  assert.ok(inspectGrhDirectoryArtifact(absenceOrder).errors.includes(
    'records.0.absence_history.deterministic_order',
  ));

  const absenceCutoff = artifactFixture();
  absenceCutoff.records[0].absence_history[0].date = '2026-09-01';
  assert.ok(inspectGrhDirectoryArtifact(absenceCutoff).errors.includes(
    'records.0.absence_history.0.after_snapshot',
  ));

  const movementIdentity = artifactFixture();
  movementIdentity.records[0].movement.row_count += 1;
  assert.ok(inspectGrhDirectoryArtifact(movementIdentity).errors.includes(
    'records.0.movement_history.row_count_identity',
  ));

  const movementOrder = artifactFixture();
  movementOrder.records[0].movement_history.reverse();
  assert.ok(inspectGrhDirectoryArtifact(movementOrder).errors.includes(
    'records.0.movement_history.deterministic_order',
  ));

  const impossibleMovementMonth = artifactFixture();
  impossibleMovementMonth.records[0].movement.latest_period = '2025-99';
  impossibleMovementMonth.records[0].movement_history[0].period = '2025-99';
  assert.ok(inspectGrhDirectoryArtifact(impossibleMovementMonth).errors.includes(
    'records.0.movement.latest_period',
  ));
  assert.ok(inspectGrhDirectoryArtifact(impossibleMovementMonth).errors.includes(
    'records.0.movement_history.0.period',
  ));

  const sourceIdentity = artifactFixture();
  sourceIdentity.counts.valid_movement_rows -= 1;
  assert.ok(inspectGrhDirectoryArtifact(sourceIdentity).errors.includes(
    'counts.movement_source_identity',
  ));
});

test('v3 employment truth table rejects impossible dates, false statuses and ungovened payroll periods', () => {
  const impossibleDate = artifactFixture();
  impossibleDate.records[0].employment.reported_ingress_date = '2025-02-31';
  assert.ok(inspectGrhDirectoryArtifact(impossibleDate).errors.includes(
    'records.0.employment.reported_ingress_date',
  ));

  const falseCurrent = artifactFixture();
  falseCurrent.records[0].employment.reported_ingress_date = '1960-01-01';
  assert.ok(inspectGrhDirectoryArtifact(falseCurrent).errors.includes(
    'records.0.employment.status_date_identity',
  ));

  const falseImplausible = artifactFixture();
  falseImplausible.records[0].employment.reported_status = 'unknown_implausible_active_tenure';
  assert.ok(inspectGrhDirectoryArtifact(falseImplausible).errors.includes(
    'records.0.employment.status_date_identity',
  ));

  const falseInvalid = artifactFixture();
  falseInvalid.records[0].employment.reported_status = 'invalid_chronology';
  assert.ok(inspectGrhDirectoryArtifact(falseInvalid).errors.includes(
    'records.0.employment.status_date_identity',
  ));

  const invalidChronology = artifactFixture();
  invalidChronology.records[0].employment.reported_exit_date = '1999-12-31';
  invalidChronology.records[0].employment.reported_status = 'invalid_chronology';
  invalidChronology.counts.employment_statuses.current_by_reported_dates -= 1;
  invalidChronology.counts.employment_statuses.invalid_chronology += 1;
  assert.equal(inspectGrhDirectoryArtifact(invalidChronology).ok, true);

  const wrongReference = artifactFixture();
  wrongReference.records[0].employment.reference_payroll_participation.period = '2026-08';
  assert.ok(inspectGrhDirectoryArtifact(wrongReference).errors.includes(
    'records.0.employment.reference_payroll_participation.period',
  ));

  const falseParticipation = artifactFixture();
  falseParticipation.records[0].employment.reference_payroll_participation.observed = false;
  assert.ok(inspectGrhDirectoryArtifact(falseParticipation).errors.includes(
    'records.0.employment.reference_payroll_participation.observed_identity',
  ));

  const currentWithTermination = artifactFixture();
  currentWithTermination.records[0].termination_reason = { code: 1, label: 'Renuncia' };
  assert.ok(inspectGrhDirectoryArtifact(currentWithTermination).errors.includes(
    'records.0.termination_reason.status_identity',
  ));

  const unlabeledTermination = artifactFixture();
  unlabeledTermination.records[1].termination_reason = { code: 99, label: null };
  assert.equal(inspectGrhDirectoryArtifact(unlabeledTermination).ok, false);

  const forbiddenAbsenceCause = artifactFixture();
  forbiddenAbsenceCause.records[0].absence_history[0].cause = 'Privada';
  assert.ok(inspectGrhDirectoryArtifact(forbiddenAbsenceCause).errors.includes(
    'records.0.absence_history.0.shape',
  ));

  const forbiddenLeaveReason = artifactFixture();
  forbiddenLeaveReason.records[0].leave_history[0].reason = 'Privada';
  assert.ok(inspectGrhDirectoryArtifact(forbiddenLeaveReason).errors.includes(
    'records.0.leave_history.0.shape',
  ));
});

test('AES-256-GCM envelope is exact, opaque and round-trips a governed artifact', () => {
  const artifact = artifactFixture();
  assert.equal(inspectGrhDirectoryArtifact(artifact).ok, true);
  const envelope = envelopeFixture();
  assert.deepEqual(Object.keys(envelope).sort(), [
    'aad', 'authTag', 'cipher', 'ciphertext', 'compression', 'kind', 'keyVersion',
    'absenceRecordCount', 'leaveRecordCount', 'movementPeriodCount', 'nonce',
    'positionObservationCount', 'recordCount',
    'schemaVersion', 'snapshotAsOf', 'sourceSha256',
  ].sort());
  assert.equal(GRH_DIRECTORY_SNAPSHOT_ACTION, 'GRH_DIRECTORY_SNAPSHOT_PAYLOAD_V1');
  assert.equal(envelope.kind, 'grh.directory.snapshot.v3');
  assert.deepEqual(envelope.aad, {
    tenantId: 'tenant-a',
    schemaVersion: 'grh-directory-v3',
    sourceSha256: 'a'.repeat(64),
    snapshotAsOf: '2026-08-06',
    keyVersion: 'v1',
    compression: 'gzip',
    absenceRecordCount: 3,
    movementPeriodCount: 3,
  });
  assert.equal(envelope.nonce, Buffer.alloc(12, 1).toString('base64url'));
  assert.equal(envelope.authTag.length, 22);
  assert.doesNotMatch(JSON.stringify(envelope), /Ágata|Bruno|Celina|legajo/i);

  const decrypted = decryptGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-a',
    envelope,
    key: SNAPSHOT_KEY,
  });
  assert.deepEqual(decrypted, artifact);
  assert.equal(Object.isFrozen(decrypted), true);
  assert.equal(Object.isFrozen(decrypted.records[0]), true);
});

test('keys and encoded fields must be canonical and authenticated before decompression', () => {
  const envelope = envelopeFixture();
  assert.throws(() => createGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-a',
    artifact: artifactFixture(),
    key: SNAPSHOT_KEY + '=',
  }), error => error.code === 'GRH_DIRECTORY_SNAPSHOT_KEY_INVALID');

  const wrongKey = Buffer.alloc(32, 8).toString('base64url');
  assert.throws(() => decryptGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-a', envelope, key: wrongKey,
  }), error => error.code === 'GRH_DIRECTORY_SNAPSHOT_AUTH_INVALID');

  const badTag = structuredClone(envelope);
  badTag.authTag = Buffer.alloc(16, 9).toString('base64url');
  assert.throws(() => decryptGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-a', envelope: badTag, key: SNAPSHOT_KEY,
  }), error => error.code === 'GRH_DIRECTORY_SNAPSHOT_AUTH_INVALID');

  const nonCanonicalNonce = structuredClone(envelope);
  nonCanonicalNonce.nonce += '=';
  assert.throws(() => decryptGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-a', envelope: nonCanonicalNonce, key: SNAPSHOT_KEY,
  }), error => error.code === 'GRH_DIRECTORY_SNAPSHOT_ENVELOPE_INVALID');
});

test('exact metadata, tenant-bound AAD, count identity and ciphertext limits fail closed', () => {
  const envelope = envelopeFixture();
  assert.equal(decryptGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-a', envelope, key: SNAPSHOT_KEY,
  }).records.length, 3);
  const extra = { ...structuredClone(envelope), plaintext: 'forbidden' };
  assert.throws(() => decryptGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-a', envelope: extra, key: SNAPSHOT_KEY,
  }), error => error.code === 'GRH_DIRECTORY_SNAPSHOT_ENVELOPE_INVALID');

  assert.throws(() => decryptGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-b', envelope, key: SNAPSHOT_KEY,
  }), error => error.code === 'GRH_DIRECTORY_SNAPSHOT_AAD_INVALID');

  const wrongCount = structuredClone(envelope);
  wrongCount.leaveRecordCount += 1;
  assert.throws(() => decryptGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-a', envelope: wrongCount, key: SNAPSHOT_KEY,
  }), error => error.code === 'GRH_DIRECTORY_SNAPSHOT_COUNT_MISMATCH');

  const unauthenticatedAbsenceCount = structuredClone(envelope);
  unauthenticatedAbsenceCount.absenceRecordCount += 1;
  assert.throws(() => decryptGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-a', envelope: unauthenticatedAbsenceCount, key: SNAPSHOT_KEY,
  }), error => error.code === 'GRH_DIRECTORY_SNAPSHOT_AAD_INVALID');

  const unauthenticatedMovementCount = structuredClone(envelope);
  unauthenticatedMovementCount.movementPeriodCount += 1;
  assert.throws(() => decryptGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-a', envelope: unauthenticatedMovementCount, key: SNAPSHOT_KEY,
  }), error => error.code === 'GRH_DIRECTORY_SNAPSHOT_AAD_INVALID');

  const oversized = structuredClone(envelope);
  oversized.ciphertext = Buffer.alloc(4 * 1024 * 1024 + 1, 1).toString('base64url');
  assert.throws(() => decryptGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-a', envelope: oversized, key: SNAPSHOT_KEY,
  }), error => error.code === 'GRH_DIRECTORY_SNAPSHOT_ENVELOPE_INVALID');
});

test('JSONB key reordering is safe while cache entries remain tenant and key isolated', () => {
  const firstEnvelope = envelopeFixture({ tenantId: 'tenant-a' });
  firstEnvelope.aad = {
    compression: 'gzip',
    keyVersion: 'v1',
    snapshotAsOf: '2026-08-06',
    sourceSha256: 'a'.repeat(64),
    schemaVersion: 'grh-directory-v3',
    absenceRecordCount: 3,
    movementPeriodCount: 3,
    tenantId: 'tenant-a',
  };
  const first = decryptGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-a', envelope: firstEnvelope, key: SNAPSHOT_KEY,
  });
  const secondEnvelope = envelopeFixture({ tenantId: 'tenant-b' });
  const second = decryptGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-b', envelope: secondEnvelope, key: SNAPSHOT_KEY,
  });
  assert.notEqual(first, second);
  assert.equal(first.source.sha256, second.source.sha256);

  const wrongKey = Buffer.alloc(32, 8).toString('base64url');
  assert.throws(() => decryptGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-a', envelope: firstEnvelope, key: wrongKey,
  }), error => error.code === 'GRH_DIRECTORY_SNAPSHOT_AUTH_INVALID');
});

test('snapshot list mode supports accent-insensitive token search, facets and opaque cursors', async () => {
  const envelope = envelopeFixture();
  const environment = { GRH_DIRECTORY_SNAPSHOT_KEY_V1: SNAPSHOT_KEY };
  const first = await readGrhDirectory({
    tenantId: 'tenant-a',
    query: { limit: '1' },
    queryImpl: snapshotQuery(envelope),
    environment,
  });
  assert.equal(inspectGrhDirectoryResponse(first).ok, true);
  assert.equal(first.items[0].displayName, 'Ágata de Prueba');
  assert.equal(first.query.total, 3);
  assert.equal(first.query.hasNext, true);
  assert.equal(first.facets.sectors[0].code, 7);
  assert.equal(first.facets.sectors[0].count, 2);
  assert.equal(first.facets.costCenters[0].code, 60);
  assert.equal(first.facets.costCenters[0].count, 2);
  assert.equal(first.facets.categories[0].agreementCode, 2);
  assert.deepEqual(first.facets.reportedStatuses.find(row => (
    row.status === 'current_by_reported_dates'
  )), {
    status: 'current_by_reported_dates',
    label: 'Sin egreso informado al corte',
    count: 1,
  });
  assert.deepEqual(first.facets.contractRegimes.find(row => row.code === 1), {
    code: 1, label: 'Planta permanente', count: 1,
  });
  assert.deepEqual(first.facets.serviceSituations.find(row => row.code === 1), {
    code: 1, label: 'Normal', count: 1,
  });
  assert.deepEqual(first.items[0].costCenter, { code: 60, label: 'Hospital' });
  assert.deepEqual(first.items[0].employment, {
    reportedIngressDate: '2000-01-01',
    reportedExitDate: null,
    reportedStatus: 'current_by_reported_dates',
    asOf: '2026-08-06',
    basis: 'legajo_reported_dates',
    referencePayrollParticipation: { period: '2026-07', observed: true, rowCount: 2 },
  });
  assert.deepEqual(first.items[0].contractRegime, { code: 1, label: 'Planta permanente' });
  assert.deepEqual(first.items[0].serviceSituation, { code: 1, label: 'Normal' });
  assert.equal(first.items[0].terminationReason, null);
  assert.deepEqual(first.items[0].movement, {
    rowCount: 3,
    periodCount: 2,
    latestPeriod: '2026-07',
  });

  const second = await readGrhDirectory({
    tenantId: 'tenant-a',
    query: { limit: '1', cursor: first.query.nextCursor },
    queryImpl: snapshotQuery(envelope),
    environment,
  });
  assert.equal(second.items[0].displayName, 'Bruno Operativo');
  assert.equal(second.query.page, 2);

  const searched = await readGrhDirectory({
    tenantId: 'tenant-a',
    query: { search: 'prueba agata', hasLeave: 'true' },
    queryImpl: snapshotQuery(envelope),
    environment,
  });
  assert.equal(inspectGrhDirectoryResponse(searched).ok, true);
  assert.equal(searched.query.total, 1);
  assert.equal(searched.items[0].legajo, 1001);
  assert.doesNotMatch(JSON.stringify(searched.items), /dni|cuil|salary|address|bank_account/i);

  const filtered = await readGrhDirectory({
    tenantId: 'tenant-a',
    query: {
      reportedStatus: 'ended_by_reported_dates',
      contractRegime: '2',
      serviceSituation: '2',
    },
    queryImpl: snapshotQuery(envelope),
    environment,
  });
  assert.equal(inspectGrhDirectoryResponse(filtered).ok, true);
  assert.equal(filtered.query.total, 1);
  assert.equal(filtered.items[0].legajo, 1002);
  assert.deepEqual(filtered.items[0].terminationReason, { code: 1, label: 'Renuncia' });

  await assert.rejects(() => readGrhDirectory({
    tenantId: 'tenant-a',
    query: { reportedStatus: 'active' },
    queryImpl: snapshotQuery(envelope),
    environment,
  }), error => error.code === 'GRH_DIRECTORY_QUERY_INVALID' && error.status === 400);
});

test('snapshot search normalizes compatibility characters on both query and stored names', async () => {
  const artifact = artifactFixture();
  artifact.records[1].display_name = 'Bruno \uFF2Fperativo';
  const envelope = createGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant-a',
    artifact,
    key: SNAPSHOT_KEY,
    nonce: Buffer.alloc(12, 9),
  });
  const result = await readGrhDirectory({
    tenantId: 'tenant-a',
    query: { search: 'operativo' },
    queryImpl: snapshotQuery(envelope),
    environment: { GRH_DIRECTORY_SNAPSHOT_KEY_V1: SNAPSHOT_KEY },
  });
  assert.equal(inspectGrhDirectoryResponse(result).ok, true);
  assert.equal(result.query.total, 1);
  assert.equal(result.items[0].legajo, 1002);
});

test('snapshot cursors are bound to the active source and storage ordering contract', async () => {
  const envelope = envelopeFixture();
  const pinnedEnvironment = {
    GRH_DIRECTORY_SNAPSHOT_KEY_V1: SNAPSHOT_KEY,
    GRH_SOURCE_SHA256: 'a'.repeat(64),
  };
  const first = await readGrhDirectory({
    tenantId: 'tenant-a',
    query: { limit: '1' },
    queryImpl: snapshotQuery(envelope),
    environment: pinnedEnvironment,
  });
  assert.equal(typeof first.query.nextCursor, 'string');

  await assert.rejects(() => readGrhDirectory({
    tenantId: 'tenant-a',
    query: { limit: '1', cursor: first.query.nextCursor },
    queryImpl: async () => assert.fail('a cursor from another backend must fail before SQL'),
    environment: { GRH_SOURCE_SHA256: 'a'.repeat(64) },
  }), error => error.code === 'GRH_DIRECTORY_QUERY_INVALID' && error.status === 400);

  await assert.rejects(() => readGrhDirectory({
    tenantId: 'tenant-a',
    query: { limit: '1', cursor: first.query.nextCursor },
    queryImpl: async () => assert.fail('a cursor from another source must fail before reading'),
    environment: {
      GRH_DIRECTORY_SNAPSHOT_KEY_V1: SNAPSHOT_KEY,
      GRH_SOURCE_SHA256: 'b'.repeat(64),
    },
  }), error => error.code === 'GRH_DIRECTORY_QUERY_INVALID' && error.status === 400);
});

test('snapshot detail preserves ambiguity handling and returns governed event histories', async () => {
  const envelope = envelopeFixture();
  const options = {
    tenantId: 'tenant-a',
    queryImpl: snapshotQuery(envelope),
    environment: { GRH_DIRECTORY_SNAPSHOT_KEY_V1: SNAPSHOT_KEY },
  };
  await assert.rejects(() => readGrhDirectory({
    ...options,
    query: { legajo: '1001' },
  }), error => error.code === 'GRH_DIRECTORY_LEGAJO_AMBIGUOUS' && error.status === 409);

  const detail = await readGrhDirectory({
    ...options,
    query: { legajo: '1001', company: '101' },
  });
  assert.equal(inspectGrhDirectoryResponse(detail).ok, true);
  assert.equal(detail.facets, null);
  assert.equal(detail.items[0].leaveHistory.total, 2);
  assert.equal(detail.items[0].leaveHistory.items[0].startDate, '2026-05-01');
  assert.deepEqual(detail.items[0].absenceHistory, {
    total: 2,
    limit: 24,
    items: [
      { date: '2026-07-01', days: 1 },
      { date: '2026-06-01', days: 2 },
    ],
  });
  assert.deepEqual(detail.items[0].movementHistory, {
    total: 2,
    limit: 24,
    items: [
      { period: '2026-07', rowCount: 2 },
      { period: '2026-06', rowCount: 1 },
    ],
  });

  const extraShape = structuredClone(detail);
  extraShape.items[0].movementHistory.items[0].cause = 'forbidden';
  assert.ok(inspectGrhDirectoryResponse(extraShape).errors.includes(
    'items.0.movementHistory.items.0.shape',
  ));

  const missingV2Fields = structuredClone(detail);
  delete missingV2Fields.items[0].movement;
  delete missingV2Fields.items[0].movementHistory;
  assert.doesNotThrow(() => inspectGrhDirectoryResponse(missingV2Fields));
  assert.equal(inspectGrhDirectoryResponse(missingV2Fields).ok, false);

  const absenceOrder = structuredClone(detail);
  absenceOrder.items[0].absenceHistory.items.reverse();
  assert.ok(inspectGrhDirectoryResponse(absenceOrder).errors.includes(
    'items.0.absenceHistory.deterministic_order',
  ));

  const movementCount = structuredClone(detail);
  movementCount.items[0].movementHistory.total += 1;
  assert.ok(inspectGrhDirectoryResponse(movementCount).errors.includes(
    'items.0.movementHistory.total_identity',
  ));

  const impossibleMovementMonth = structuredClone(detail);
  impossibleMovementMonth.items[0].movement.latestPeriod = '2025-99';
  impossibleMovementMonth.items[0].movementHistory.items[0].period = '2025-99';
  assert.ok(inspectGrhDirectoryResponse(impossibleMovementMonth).errors.includes(
    'items.0.movement.latestPeriod',
  ));
  assert.ok(inspectGrhDirectoryResponse(impossibleMovementMonth).errors.includes(
    'items.0.movementHistory.items.0.period',
  ));
});

test('without the snapshot key the existing materialized-table SQL path is unchanged', async () => {
  let materializedSql = false;
  await assert.rejects(() => readGrhDirectory({
    tenantId: 'tenant-a',
    query: {},
    environment: {},
    queryImpl: async (sql, values) => {
      materializedSql = true;
      assert.match(sql, /FROM grh_directory_sources/);
      assert.doesNotMatch(sql, /FROM audit_logs/);
      assert.equal(values[0], 'tenant-a');
      return { rows: [] };
    },
  }), error => error.code === 'GRH_DIRECTORY_SOURCE_UNAVAILABLE');
  assert.equal(materializedSql, true);
});
