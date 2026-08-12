import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  flattenGrhDirectoryArtifact,
  grhDirectoryContentSha256,
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
      canonical_system: 'GRH Junin',
      file: 'backup.sql.gz',
      sha256: 'a'.repeat(64),
      compressed_size_bytes: 100,
      snapshot_as_of: '2026-08-06',
      generated_at: '2026-08-10T12:00:00.000Z',
    },
    privacy: {
      contains_personal_data: true,
      private_storage_required: true,
      excluded_fields: ['dni', 'cuil', 'contact', 'address', 'bank_account', 'salary', 'absence_leave_event_cause'],
    },
    counts: {
      source_rows: {
        ausencia: 0, calculo: 2, cargo: 0, catego: 0, convenio: 0, costos: 0,
        histolegajo: 0, legajo: 1, legamov: 0, licencia: 0, motibaja: 1,
        organiza: 0, persona: 1, regcontr: 1, revista: 1, sectores: 0,
      },
      directory_records: 1,
      person_matches: 1,
      records_with_name: 1,
      records_without_name: 0,
      duplicate_person_links: 0,
      invalid_employee_key_rows: 0,
      valid_absence_events: 0,
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
      valid_calculation_rows: 2,
      quarantined_calculation_rows: 0,
      reference_payroll_period: '2026-07',
      reference_payroll_rows: 2,
      records_observed_in_reference_payroll: 1,
      employment_statuses: {
        ended_by_reported_dates: 0,
        current_by_reported_dates: 1,
        unknown_missing_ingress: 0,
        unknown_sentinel_ingress: 0,
        unknown_implausible_active_tenure: 0,
        invalid_chronology: 0,
      },
    },
    records: [{
      company_code: 101,
      legajo: 1,
      display_name: 'Persona',
      sector: null,
      cost_center: null,
      organization: null,
      position: null,
      category: null,
      agreement: null,
      absence: { event_count: 0, latest_date: null },
      absence_history: [],
      leave: { event_count: 0, latest_start_date: null, latest_end_date: null },
      leave_history: [],
      movement: { row_count: 0, period_count: 0, latest_period: null },
      movement_history: [],
      position_observation: null,
      contract_regime: { code: 1, label: 'Permanente' },
      service_situation: { code: 2, label: 'Servicio activo' },
      termination_reason: null,
      employment: {
        reported_ingress_date: '2010-02-03',
        reported_exit_date: null,
        reported_status: 'current_by_reported_dates',
        as_of: '2026-08-06',
        basis: 'legajo_reported_dates',
        reference_payroll_participation: { period: '2026-07', observed: true, row_count: 2 },
      },
    }],
  };
}

function rawMaterializedRow(artifact) {
  return {
    canonical_system: artifact.source.canonical_system,
    source_file: artifact.source.file,
    source_sha256: artifact.source.sha256,
    snapshot_as_of: artifact.source.snapshot_as_of,
    total: 1,
    facets: {
      sectors: [], costCenters: [], organizations: [], positions: [], positionObservations: [],
      categories: [], agreements: [],
      reportedStatuses: [{ status: 'current_by_reported_dates', count: 1 }],
      contractRegimes: [{ code: 1, label: 'Permanente', count: 1 }],
      serviceSituations: [{ code: 2, label: 'Servicio activo', count: 1 }],
    },
    items: [{
      company_code: 101, legajo: 1, display_name: 'Persona',
      sector_code: null, sector_label: null, cost_center_code: null, cost_center_label: null,
      organization_code: null, organization_label: null, position_code: null, position_label: null,
      position_parent_code: null, position_parent_label: null,
      position_depends_on_code: null, position_depends_on_label: null,
      position_observation_label: null, position_observed_date: null,
      position_observed_period: null, position_observation_status: null,
      position_observation_source: null, category_code: null, category_label: null,
      agreement_code: null, agreement_label: null,
      reported_ingress_date: '2010-02-03', reported_exit_date: null,
      reported_status: 'current_by_reported_dates', employment_as_of: '2026-08-06',
      employment_basis: 'legajo_reported_dates', reference_payroll_period: '2026-07',
      reference_payroll_observed: true, reference_payroll_row_count: 2,
      contract_regime_code: 1, contract_regime_label: 'Permanente',
      service_situation_code: 2, service_situation_label: 'Servicio activo',
      termination_reason_code: null, termination_reason_label: null,
      absence_event_count: 0, latest_absence_date: null, leave_event_count: 0,
      latest_leave_start_date: null, latest_leave_end_date: null,
      movement_row_count: 0, movement_period_count: 0, latest_movement_period: null,
    }],
  };
}

test('v3 publication flattens source-backed employment and global catalogues', () => {
  const artifact = artifactFixture();
  const flattened = flattenGrhDirectoryArtifact(artifact);
  assert.deepEqual(flattened.dimensions.map(item => [item.dimension, item.company_code, item.code]), [
    ['contractRegime', 0, 1],
    ['serviceSituation', 0, 2],
  ]);
  assert.equal(flattened.people[0].reported_status, 'current_by_reported_dates');
  assert.equal(flattened.people[0].reference_payroll_period, '2026-07');
  assert.equal(flattened.people[0].reference_payroll_observed, true);
  assert.match(flattened.people[0].content_sha256, /^[0-9a-f]{64}$/);
});

test('v3 digest ignores volatile generation time but changes with governed content', () => {
  const first = artifactFixture();
  const generatedLater = structuredClone(first);
  generatedLater.source.generated_at = '2026-08-11T12:00:00.000Z';
  assert.equal(grhDirectoryContentSha256(first), grhDirectoryContentSha256(generatedLater));
  const changed = structuredClone(first);
  changed.records[0].contract_regime.label = 'Planta permanente';
  assert.notEqual(grhDirectoryContentSha256(first), grhDirectoryContentSha256(changed));
  const reordered = structuredClone(first);
  reordered.records[0] = Object.fromEntries(Object.entries(reordered.records[0]).reverse());
  reordered.records[0].employment = Object.fromEntries(
    Object.entries(reordered.records[0].employment).reverse(),
  );
  assert.equal(grhDirectoryContentSha256(first), grhDirectoryContentSha256(reordered));
});

test('v3 filters are exact, parameterized and every facet is authorization-scoped', () => {
  const parsed = parseGrhDirectoryQuery({
    reportedStatus: 'current_by_reported_dates', contractRegime: '1', serviceSituation: '2',
  });
  const built = buildGrhDirectorySql('tenant', parsed, { scopeOrganizationCodes: [7] });
  assert.match(built.sql, /p\.reported_status = \$\d+/);
  assert.match(built.sql, /p\.contract_regime_code = \$\d+/);
  assert.match(built.sql, /p\.service_situation_code = \$\d+/);
  assert.equal([...built.sql.matchAll(/people\.organization_code = ANY\(\$2::integer\[\]\)/g)].length, 10);
  assert.ok(built.values.includes('current_by_reported_dates'));
  assert.throws(() => parseGrhDirectoryQuery({ reportedStatus: 'active' }), /directorio GRH/i);
  assert.throws(() => parseGrhDirectoryQuery({ employmentArrangement: '1' }), /directorio GRH/i);
});

test('materialized and encrypted snapshot modes expose equivalent v3 employment and facets', async () => {
  const artifact = artifactFixture();
  const key = Buffer.alloc(32, 4).toString('base64url');
  const envelope = createGrhDirectorySnapshotEnvelope({
    tenantId: 'tenant', artifact, key, nonce: Buffer.alloc(12, 2),
  });
  const query = {
    reportedStatus: 'current_by_reported_dates', contractRegime: '1', serviceSituation: '2',
  };
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
    queryImpl: async () => ({ rows: [rawMaterializedRow(artifact)] }),
  });
  assert.deepEqual(materialized.items, snapshot.items);
  assert.deepEqual(materialized.facets, snapshot.facets);
  assert.equal(materialized.items[0].employment.referencePayrollParticipation.period, '2026-07');
});

test('same-digest replay still rebuilds all materialized families before returning unchanged', async () => {
  const commands = [];
  const artifact = artifactFixture();
  const contentSha256 = grhDirectoryContentSha256(artifact);
  const client = {
    async query(sql) {
      const text = String(sql);
      commands.push(text);
      if (text.includes('FOR UPDATE')) return { rows: [{
        schema_version: artifact.schema_version,
        source_sha256: artifact.source.sha256,
        snapshot_as_of: artifact.source.snapshot_as_of,
        content_sha256: contentSha256,
      }] };
      if (text.includes('AS people') && text.includes('AS dimensions')) return { rows: [{
        people: 1, dimensions: 2, absence_events: 0, leave_events: 0,
        movement_periods: 0, position_observations: 0,
      }] };
      return { rows: [] };
    },
  };
  assert.deepEqual(await publishGrhDirectory(client, 'tenant', artifact), {
    status: 'unchanged', contentSha256,
  });
  assert.ok(commands.some(sql => sql.startsWith('DELETE FROM grh_directory_people')));
  assert.ok(commands.some(sql => sql.includes('INSERT INTO grh_directory_people')));
  assert.ok(commands.some(sql => sql.includes('INSERT INTO grh_directory_dimensions')));
});

test('005 is additive, private and pins v3 content and employment integrity', async () => {
  const sql = await readFile(new URL('../migrations/005_grh_directory_v3.sql', import.meta.url), 'utf8');
  assert.match(sql, /Apply after 004_grh_directory_v2\.sql/);
  assert.match(sql, /schema_version IN \('grh-directory-v2', 'grh-directory-v3'\)/);
  assert.match(sql, /content_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(sql, /reference_payroll_observed = \(reference_payroll_row_count > 0\)/);
  assert.match(sql, /'contractRegime', 'serviceSituation', 'terminationReason'/);
  assert.match(sql, /idx_grh_directory_people_reported_status/);
  assert.equal((sql.match(/REVOKE ALL ON TABLE grh_directory_/g) || []).length, 3);

  const normalized = sql.replace(/\r\n/g, '\n');
  assert.equal(createHash('sha256').update(normalized).digest('hex'),
    '87d87ed17a67a99e34c5a9b5a8dcdb37a4dc57e485d1e9516e5da78729c1d671');
});
