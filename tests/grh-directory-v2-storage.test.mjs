import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  flattenGrhDirectoryArtifact,
  publishGrhDirectory,
} from '../api/lib/grh-directory-publication.js';
import {
  buildGrhDirectorySql,
  parseGrhDirectoryQuery,
  readGrhDirectory,
} from '../api/lib/grh-directory-store.js';
import {
  createGrhDirectorySnapshotEnvelope,
  GRH_DIRECTORY_SNAPSHOT_ACTION,
  GRH_DIRECTORY_SNAPSHOT_ENTITY,
} from '../api/lib/grh-directory-snapshot.js';

function artifactFixture() {
  return {
    schema_version: 'grh-directory-v3',
    source: {
      canonical_system: 'GRH Junin', file: 'backup.sql.gz', sha256: 'a'.repeat(64),
      compressed_size_bytes: 100, snapshot_as_of: '2026-08-06', generated_at: '2026-08-10T12:00:00.000Z',
    },
    privacy: {
      contains_personal_data: true, private_storage_required: true,
      excluded_fields: ['dni', 'cuil', 'contact', 'address', 'bank_account', 'salary', 'absence_leave_event_cause'],
    },
    counts: {
      source_rows: {
        ausencia: 2, calculo: 2, cargo: 0, catego: 0, convenio: 0, costos: 1,
        histolegajo: 0, legajo: 1, legamov: 3, licencia: 1, motibaja: 0,
        organiza: 0, persona: 1, regcontr: 0, revista: 0, sectores: 0,
      },
      directory_records: 1, person_matches: 1, records_with_name: 1, records_without_name: 0,
      duplicate_person_links: 0, invalid_employee_key_rows: 0,
      valid_absence_events: 2, quarantined_absence_events: 0,
      valid_leave_events: 1, quarantined_leave_events: 0,
      valid_movement_rows: 3, quarantined_movement_rows: 0,
      valid_position_observation_rows: 0, blank_position_observation_rows: 0,
      quarantined_position_observation_rows: 0, future_effective_position_observation_rows: 0,
      records_with_position_observation: 0,
      valid_calculation_rows: 2, quarantined_calculation_rows: 0,
      reference_payroll_period: '2026-07', reference_payroll_rows: 2,
      records_observed_in_reference_payroll: 1,
      employment_statuses: {
        ended_by_reported_dates: 0, current_by_reported_dates: 1,
        unknown_missing_ingress: 0, unknown_sentinel_ingress: 0,
        unknown_implausible_active_tenure: 0, invalid_chronology: 0,
      },
    },
    records: [{
      company_code: 101, legajo: 1, display_name: 'Persona', sector: null,
      cost_center: { code: 8, label: 'Servicios' }, organization: null, position: null,
      category: null, agreement: null,
      absence: { event_count: 2, latest_date: '2026-07-02' },
      absence_history: [{ date: '2026-07-02', days: 1 }, { date: '2026-06-01', days: null }],
      leave: { event_count: 1, latest_start_date: '2026-05-01', latest_end_date: '2026-05-02' },
      leave_history: [{ start_date: '2026-05-01', end_date: '2026-05-02', days: 2 }],
      movement: { row_count: 3, period_count: 2, latest_period: '2026-07' },
      movement_history: [{ period: '2026-07', row_count: 2 }, { period: '2026-06', row_count: 1 }],
      position_observation: null,
      contract_regime: null, service_situation: null, termination_reason: null,
      employment: {
        reported_ingress_date: '2010-01-01', reported_exit_date: null,
        reported_status: 'current_by_reported_dates', as_of: '2026-08-06',
        basis: 'legajo_reported_dates',
        reference_payroll_participation: { period: '2026-07', observed: true, row_count: 2 },
      },
    }],
  };
}

test('v3 publication preserves v2 cost center and complete absence/movement histories', () => {
  const flattened = flattenGrhDirectoryArtifact(artifactFixture());
  assert.deepEqual(flattened.dimensions, [{
    dimension: 'costCenter', company_code: 101, scope_code: 0, code: 8,
    label: 'Servicios', parent_code: null, depends_on_code: null,
  }]);
  assert.equal(flattened.people[0].cost_center_code, 8);
  assert.deepEqual(flattened.absenceEvents.map(item => item.event_date), ['2026-07-02', '2026-06-01']);
  assert.deepEqual(flattened.movementPeriods.map(item => [item.period, item.row_count]), [
    ['2026-07', 2], ['2026-06', 1],
  ]);
});

test('v3 store preserves costCenter/hasMovement and all bounded histories', () => {
  const parsed = parseGrhDirectoryQuery({ costCenter: '8', hasMovement: 'true' });
  const list = buildGrhDirectorySql('tenant', parsed);
  assert.match(list.sql, /p\.cost_center_code = \$\d+/);
  assert.match(list.sql, /p\.movement_row_count > 0/);
  assert.match(list.sql, /'costCenters'/);
  assert.equal(list.values.includes(8), true);

  const detail = buildGrhDirectorySql('tenant', parseGrhDirectoryQuery({ legajo: '1', company: '101' }));
  assert.match(detail.sql, /grh_directory_absence_events/);
  assert.match(detail.sql, /grh_directory_leave_events/);
  assert.match(detail.sql, /grh_directory_movement_periods/);
  assert.equal((detail.sql.match(/LIMIT 24/g) || []).length, 3);
});

test('materialized and encrypted-snapshot modes expose equivalent inherited list/filter fields', async () => {
  const artifact = artifactFixture();
  const key = Buffer.alloc(32, 4).toString('base64url');
  const envelope = createGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant', artifact, key, nonce: Buffer.alloc(12, 2),
  });
  const query = { costCenter: '8', hasMovement: 'true' };
  const snapshot = await readGrhDirectory({
    tenantId: 'tenant', query,
    environment: { GRH_DIRECTORY_SNAPSHOT_KEY_V1: key },
    queryImpl: async (sql, values) => {
      assert.match(sql, /FROM audit_logs/);
      assert.deepEqual(values, ['tenant', GRH_DIRECTORY_SNAPSHOT_ACTION, GRH_DIRECTORY_SNAPSHOT_ENTITY]);
      return { rows: [{ details: envelope }] };
    },
  });
  const materialized = await readGrhDirectory({
    tenantId: 'tenant', query, environment: {},
    queryImpl: async () => ({ rows: [{
      canonical_system: artifact.source.canonical_system,
      source_file: artifact.source.file,
      source_sha256: artifact.source.sha256,
      snapshot_as_of: artifact.source.snapshot_as_of,
      total: 1,
      facets: {
        sectors: [], costCenters: [{ code: 8, label: 'Servicios', count: 1 }],
        organizations: [], positions: [], positionObservations: [], categories: [], agreements: [],
        reportedStatuses: [{ status: 'current_by_reported_dates', count: 1 }],
        contractRegimes: [], serviceSituations: [],
      },
      items: [{
        company_code: 101, legajo: 1, display_name: 'Persona',
        sector_code: null, sector_label: null,
        cost_center_code: 8, cost_center_label: 'Servicios',
        organization_code: null, organization_label: null,
        position_code: null, position_label: null,
        position_parent_code: null, position_parent_label: null,
        position_depends_on_code: null, position_depends_on_label: null,
        position_observation_label: null, position_observed_date: null,
        position_observed_period: null, position_observation_status: null,
        position_observation_source: null, category_code: null, category_label: null,
        agreement_code: null, agreement_label: null,
        reported_ingress_date: '2010-01-01', reported_exit_date: null,
        reported_status: 'current_by_reported_dates', employment_as_of: '2026-08-06',
        employment_basis: 'legajo_reported_dates', reference_payroll_period: '2026-07',
        reference_payroll_observed: true, reference_payroll_row_count: 2,
        contract_regime_code: null, contract_regime_label: null,
        service_situation_code: null, service_situation_label: null,
        termination_reason_code: null, termination_reason_label: null,
        absence_event_count: 2, latest_absence_date: '2026-07-02',
        leave_event_count: 1, latest_leave_start_date: '2026-05-01', latest_leave_end_date: '2026-05-02',
        movement_row_count: 3, movement_period_count: 2, latest_movement_period: '2026-07',
      }],
    }] }),
  });
  assert.deepEqual(materialized.items, snapshot.items);
  assert.deepEqual(materialized.facets, snapshot.facets);
  assert.equal(materialized.query.total, snapshot.query.total);
});

test('v3 publication checks content and republishes every inherited materialized family', async () => {
  const commands = [];
  const client = {
    async query(sql) {
      const text = String(sql);
      commands.push(text);
      if (text.includes('FOR UPDATE')) return { rows: [] };
      if (text.includes('AS people') && text.includes('AS dimensions')) return { rows: [{
        people: 1, dimensions: 1, absence_events: 2, leave_events: 1,
        movement_periods: 2, position_observations: 0,
      }] };
      return { rows: [] };
    },
  };
  const result = await publishGrhDirectory(client, 'tenant', artifactFixture());
  assert.equal(result.status, 'published');
  assert.match(result.contentSha256, /^[0-9a-f]{64}$/);
  for (const table of [
    'grh_directory_absence_events', 'grh_directory_leave_events', 'grh_directory_movement_periods',
  ]) assert.equal(commands.some(sql => sql.includes(table)), true);
});

test('v3 publication repairs equal-cardinality content drift instead of using counts as identity', async () => {
  const commands = [];
  const artifact = artifactFixture();
  const client = {
    async query(sql) {
      const text = String(sql);
      commands.push(text);
      if (text.includes('FOR UPDATE')) return { rows: [{
        schema_version: artifact.schema_version,
        source_sha256: artifact.source.sha256,
        snapshot_as_of: artifact.source.snapshot_as_of,
        record_count: 1,
        leave_record_count: 1,
        position_observation_count: 0,
        absence_record_count: 2,
        movement_period_count: 2,
      }] };
      if (text.includes('AS people') && text.includes('AS dimensions')) return { rows: [{
        people: 1, dimensions: 1, absence_events: 2, leave_events: 1,
        movement_periods: 2, position_observations: 0,
      }] };
      return { rows: [] };
    },
  };
  const result = await publishGrhDirectory(client, 'tenant', artifact);
  assert.equal(result.status, 'replaced');
  assert.match(result.contentSha256, /^[0-9a-f]{64}$/);
  assert.ok(commands.some(sql => sql.startsWith('DELETE FROM grh_directory_people')));
  assert.ok(commands.some(sql => sql.includes('INSERT INTO grh_directory_people')));
  assert.ok(commands.some(sql => sql.includes('INSERT INTO grh_directory_movement_periods')));
});

test('004 migration pins v2 schema, tenant cascades, indexes and private tables', async () => {
  const sql = await readFile(new URL('../migrations/004_grh_directory_v2.sql', import.meta.url), 'utf8');
  assert.match(sql, /schema_version = 'grh-directory-v2'/);
  assert.match(sql, /'costCenter'/);
  assert.match(sql, /absence_record_count/);
  assert.match(sql, /movement_period_count/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS grh_directory_absence_events/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS grh_directory_movement_periods/);
  assert.equal((sql.match(/\^\[0-9\]\{4\}-\(0\[1-9\]\|1\[0-2\]\)\$/g) || []).length, 2);
  assert.equal((sql.match(/ON DELETE CASCADE/g) || []).length, 2);
  assert.equal((sql.match(/REVOKE ALL ON TABLE grh_directory_(?:absence_events|movement_periods) FROM PUBLIC/g) || []).length, 2);
});
