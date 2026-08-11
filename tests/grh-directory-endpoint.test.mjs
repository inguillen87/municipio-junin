import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GRH_DIRECTORY_EXCLUDED_FIELDS,
  inspectGrhDirectoryArtifact,
  inspectGrhDirectoryResponse,
} from '../api/lib/grh-directory-contract.js';
import {
  buildGrhDirectorySql,
  encodeGrhDirectoryCursor,
  parseGrhDirectoryQuery,
  readGrhDirectory,
} from '../api/lib/grh-directory-store.js';
import {
  flattenGrhDirectoryArtifact,
  publishGrhDirectory,
} from '../api/lib/grh-directory-publication.js';
import {
  createGrhDirectoryHandler,
  parseDirectoryUserAllowlist,
} from '../api/grh-directory.js';

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

const PILOT_GUARDS = Object.freeze({
  isPublicRequestImpl: () => false,
  isPublishedIdentityImpl: () => false,
  authorizationStore: Object.freeze({
    async loadAuthorizationFacts() { throw new Error('disabled must not query enterprise facts'); },
  }),
  async appendAuditImpl() { throw new Error('disabled must not write enterprise audit'); },
});

function directoryRequest(query = {}, purpose = 'DIRECTORY_BROWSE') {
  return {
    method: 'GET',
    query,
    headers: { 'x-municontrol-purpose': purpose },
  };
}

function pilotEnvironment(allowlist) {
  return {
    GRH_TENANT_ID: 'tenant-test',
    GRH_DIRECTORY_AUTHZ_MODE: 'disabled',
    ...(allowlist ? { GRH_DIRECTORY_ALLOWED_USER_IDS: allowlist } : {}),
  };
}

function artifactFixture() {
  return {
    schema_version: 'grh-directory-v1',
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
        ausencia: 2,
        cargo: 1,
        catego: 1,
        convenio: 1,
        histolegajo: 1,
        legajo: 1,
        licencia: 1,
        organiza: 1,
        persona: 1,
        sectores: 1,
      },
      directory_records: 1,
      person_matches: 1,
      records_with_name: 1,
      records_without_name: 0,
      duplicate_person_links: 0,
      invalid_employee_key_rows: 0,
      valid_absence_events: 2,
      quarantined_absence_events: 0,
      valid_leave_events: 1,
      quarantined_leave_events: 0,
      valid_position_observation_rows: 1,
      blank_position_observation_rows: 0,
      quarantined_position_observation_rows: 0,
      future_effective_position_observation_rows: 1,
      records_with_position_observation: 1,
    },
    records: [{
      company_code: 101,
      legajo: 1001,
      display_name: 'Persona de prueba',
      sector: { code: 7, label: 'Sector' },
      organization: { code: 5, label: 'Organización' },
      position: {
        code: 4,
        label: 'Cargo',
        parent: { code: 40, label: 'Secretaria' },
        depends_on: { code: 50, label: 'Municipio' },
      },
      category: { code: 3, label: 'Categoría' },
      agreement: { code: 2, label: 'Convenio' },
      absence: { event_count: 2, latest_date: '2026-07-01' },
      leave: { event_count: 1, latest_start_date: '2026-05-01', latest_end_date: '2026-05-10' },
      leave_history: [{ start_date: '2026-05-01', end_date: '2026-05-10', days: 10 }],
      position_observation: {
        label: 'Puesto observado',
        observed_date: '2026-08-31',
        observed_period: '2026-08',
        status: 'source_future_effective',
        source_table: 'histolegajo',
      },
    }],
  };
}

function facetFixture() {
  return {
    sectors: [{ code: 7, label: 'Sector', count: 1 }],
    organizations: [{ code: 5, label: 'Organizacion', count: 1 }],
    positions: [{ code: 4, label: 'Cargo', count: 1 }],
    positionObservations: [{ label: 'Puesto observado', count: 1, status: 'source_future_effective' }],
    categories: [{ agreementCode: 2, code: 3, label: 'Categoria', count: 1 }],
    agreements: [{ code: 2, label: 'Convenio', count: 1 }],
  };
}

function responseFixture({ mode = 'list' } = {}) {
  return {
    schemaVersion: 'grh-directory-v1',
    source: {
      canonicalSystem: 'GRH Junín',
      sourceFile: 'grh_junin.backup_2026080615_plataforma.sql.gz',
      sourceSha256: 'a'.repeat(64),
      snapshotAsOf: '2026-08-06',
    },
    privacy: {
      containsPersonalData: true,
      excludedFields: [...GRH_DIRECTORY_EXCLUDED_FIELDS],
    },
    query: {
      mode,
      page: 1,
      limit: mode === 'detail' ? 1 : 25,
      total: 1,
      hasNext: false,
      cursor: null,
      nextCursor: null,
    },
    facets: mode === 'list' ? facetFixture() : null,
    items: [{
      companyCode: 101,
      legajo: 1001,
      displayName: 'Persona de prueba',
      sector: { code: 7, label: 'Sector' },
      organization: { code: 5, label: 'Organización' },
      position: {
        code: 4,
        label: 'Cargo',
        parent: { code: 40, label: 'Secretaria' },
        dependsOn: { code: 50, label: 'Municipio' },
      },
      positionObservation: {
        label: 'Puesto observado',
        observedDate: '2026-08-31',
        observedPeriod: '2026-08',
        status: 'source_future_effective',
        sourceTable: 'histolegajo',
      },
      category: { code: 3, label: 'Categoría' },
      agreement: { code: 2, label: 'Convenio' },
      events: {
        absenceCount: 2,
        latestAbsenceDate: '2026-07-01',
        leaveCount: 1,
        latestLeaveStartDate: '2026-05-01',
        latestLeaveEndDate: '2026-05-10',
      },
      ...(mode === 'detail' ? {
        leaveHistory: {
          total: 1,
          limit: 24,
          items: [{ startDate: '2026-05-01', endDate: '2026-05-10', days: 10 }],
        },
      } : {}),
    }],
  };
}

function withQuietErrors(callback) {
  const original = console.error;
  console.error = () => {};
  return Promise.resolve().then(callback).finally(() => { console.error = original; });
}

test('the private artifact and API response use exact grh-directory-v1 contracts', () => {
  const artifact = artifactFixture();
  const response = responseFixture();
  assert.equal(inspectGrhDirectoryArtifact(artifact).ok, true);
  assert.equal(inspectGrhDirectoryResponse(response).ok, true);

  artifact.records[0].salary = 10;
  assert.equal(inspectGrhDirectoryArtifact(artifact).ok, false);
  delete artifact.records[0].salary;
  artifact.counts.person_matches = 0;
  assert.ok(inspectGrhDirectoryArtifact(artifact).errors.includes('counts.person_join_required'));
  artifact.counts.person_matches = 1;
  artifact.records[0].position_observation.status = 'historical_observation';
  assert.equal(inspectGrhDirectoryArtifact(artifact).ok, false);

  response.items[0].events.latestAbsenceDate = '2027-01-01';
  assert.equal(inspectGrhDirectoryResponse(response).ok, false);
  response.items[0].events.latestAbsenceDate = '2026-07-01';
  response.items[0].positionObservation.status = 'historical_observation';
  assert.equal(inspectGrhDirectoryResponse(response).ok, false);
});

test('query parsing is exact and SQL keeps hostile search text in parameters', () => {
  const parsed = parseGrhDirectoryQuery({
    search: "O'Brien%_",
    page: '2',
    limit: '20',
    sector: '7',
    positionObservation: 'Puesto observado',
    hasAbsence: 'true',
  });
  assert.equal(parsed.page, 2);
  assert.equal(parsed.limit, 20);
  assert.equal(parsed.sector, 7);
  const built = buildGrhDirectorySql('tenant-test', parsed);
  assert.doesNotMatch(built.sql, /O'Brien/);
  assert.ok(built.values.some(value => String(value).includes("o'brien")));
  assert.match(built.sql, /p\.sector_code = \$\d+/);
  assert.match(built.sql, /p\.position_observation_label = \$\d+/);
  assert.match(built.sql, /absence_event_count > 0/);
  assert.match(built.sql, /translate\(lower\(COALESCE\(p\.display_name/);
  assert.throws(() => parseGrhDirectoryQuery({ unknown: '1' }), /directorio/i);
  assert.throws(() => parseGrhDirectoryQuery({ company: '101' }), /directorio/i);
  assert.throws(() => parseGrhDirectoryQuery({ limit: '101' }), /directorio/i);
  assert.throws(() => parseGrhDirectoryQuery({ legajo: '1001', search: 'Persona' }), /directorio/i);
});

test('name search is token-order and diacritic insensitive with filter-bound opaque cursors', () => {
  const first = parseGrhDirectoryQuery({ search: 'Ágata Prueba', limit: '20' });
  assert.deepEqual(first.searchTokens, ['agata', 'prueba']);
  const built = buildGrhDirectorySql('tenant-test', first);
  assert.equal(built.values.filter(value => String(value).includes('agata')).length, 2);
  assert.doesNotMatch(built.sql, /Ágata|Prueba/);

  const cursor = encodeGrhDirectoryCursor(20, first);
  assert.doesNotMatch(cursor, /agata|prueba/i);
  const next = parseGrhDirectoryQuery({ search: 'Prueba Agata', limit: '20', cursor });
  assert.equal(next.offset, 20);
  assert.equal(next.page, 2);
  assert.throws(() => parseGrhDirectoryQuery({ search: 'Otro', limit: '20', cursor }), /directorio/i);
  assert.throws(() => parseGrhDirectoryQuery({ search: 'Prueba Agata', limit: '20', cursor, page: '2' }), /directorio/i);
  assert.throws(() => parseGrhDirectoryQuery({ search: 'a b c d e f g' }), /directorio/i);
});

test('the store maps normalized rows without exposing excluded fields', async () => {
  const response = await readGrhDirectory({
    tenantId: 'tenant-test',
    query: { search: 'Persona', limit: '10' },
    queryImpl: async (sql, values) => {
      assert.doesNotMatch(sql, /Persona/);
      assert.equal(values[0], 'tenant-test');
      return {
        rows: [{
          canonical_system: 'GRH Junín',
          source_file: 'grh_junin.backup_2026080615_plataforma.sql.gz',
          source_sha256: 'a'.repeat(64),
          snapshot_as_of: '2026-08-06',
          total: 1,
          facets: facetFixture(),
          items: [{
            company_code: 101,
            legajo: '1001',
            display_name: 'Persona de prueba',
            sector_code: 7,
            sector_label: 'Sector',
            organization_code: 5,
            organization_label: 'Organización',
            position_code: 4,
            position_label: 'Cargo',
            position_parent_code: 40,
            position_parent_label: 'Secretaria',
            position_depends_on_code: 50,
            position_depends_on_label: 'Municipio',
            position_observation_label: 'Puesto observado',
            position_observed_date: '2026-08-31',
            position_observed_period: '2026-08',
            position_observation_status: 'source_future_effective',
            position_observation_source: 'histolegajo',
            category_code: 3,
            category_label: 'Categoría',
            agreement_code: 2,
            agreement_label: 'Convenio',
            absence_event_count: 2,
            latest_absence_date: '2026-07-01',
            leave_event_count: 1,
            latest_leave_start_date: '2026-05-01',
            latest_leave_end_date: '2026-05-10',
          }],
        }],
      };
    },
  });
  assert.equal(inspectGrhDirectoryResponse(response).ok, true);
  assert.equal(response.items[0].legajo, 1001);
  assert.doesNotMatch(JSON.stringify(response.items), /dni|cuil|salary|address|contact/i);
});

test('detail mode returns up to 24 real leave events without causes or amounts', async () => {
  const response = await readGrhDirectory({
    tenantId: 'tenant-test',
    query: { legajo: '1001', company: '101' },
    queryImpl: async sql => {
      assert.match(sql, /grh_directory_leave_events/);
      assert.match(sql, /LIMIT 24/);
      assert.doesNotMatch(sql, /cause|moti_|obs1_|salary|amount/i);
      return { rows: [{
        canonical_system: 'GRH Junin',
        source_file: 'grh_junin.backup_2026080615_plataforma.sql.gz',
        source_sha256: 'a'.repeat(64),
        snapshot_as_of: '2026-08-06',
        total: 1,
        facets: null,
        items: [{
          company_code: 101,
          legajo: 1001,
          display_name: 'Persona de prueba',
          sector_code: 7,
          sector_label: 'Sector',
          organization_code: 5,
          organization_label: 'Organizacion',
          position_code: 4,
          position_label: 'Cargo',
          position_parent_code: 40,
          position_parent_label: 'Secretaria',
          position_depends_on_code: 50,
          position_depends_on_label: 'Municipio',
          position_observation_label: 'Puesto observado',
          position_observed_date: '2026-08-31',
          position_observed_period: '2026-08',
          position_observation_status: 'source_future_effective',
          position_observation_source: 'histolegajo',
          category_code: 3,
          category_label: 'Categoria',
          agreement_code: 2,
          agreement_label: 'Convenio',
          absence_event_count: 2,
          latest_absence_date: '2026-07-01',
          leave_event_count: 2,
          latest_leave_start_date: '2009-05-01',
          latest_leave_end_date: '2009-05-10',
          leave_history: [
            { start_date: '2009-05-01', end_date: '2009-05-10', days: 10 },
            { start_date: '2008-02-01', end_date: '2008-02-02', days: 2 },
          ],
        }],
      }] };
    },
  });
  assert.equal(inspectGrhDirectoryResponse(response).ok, true);
  assert.equal(response.facets, null);
  assert.equal(response.items[0].leaveHistory.total, 2);
  assert.equal(response.items[0].leaveHistory.items[0].startDate, '2009-05-01');
  assert.doesNotMatch(JSON.stringify(response.items), /cause|moti_|obs1_|salary|amount|dni|cuil/i);
});

test('detail lookup fails closed when a legajo is ambiguous across companies', async () => {
  await assert.rejects(() => readGrhDirectory({
    tenantId: 'tenant-test',
    query: { legajo: '1001' },
    queryImpl: async () => ({ rows: [{
      canonical_system: 'GRH Junín',
      source_file: 'grh_junin.backup_2026080615_plataforma.sql.gz',
      source_sha256: 'a'.repeat(64),
      snapshot_as_of: '2026-08-06',
      total: 2,
      items: [],
    }] }),
  }), error => error.code === 'GRH_DIRECTORY_LEGAJO_AMBIGUOUS' && error.status === 409);
});

test('the user allowlist is exact, rejects wildcard/duplicates and has no default', () => {
  assert.equal(parseDirectoryUserAllowlist(undefined), null);
  assert.equal(parseDirectoryUserAllowlist('*'), null);
  assert.equal(parseDirectoryUserAllowlist('official-1,official-1'), null);
  assert.deepEqual([...parseDirectoryUserAllowlist('official-1, official-2')], ['official-1', 'official-2']);
});

test('the endpoint is GET-only, no-store and does not authenticate non-GET requests', async () => {
  let authenticated = false;
  const handler = createGrhDirectoryHandler({
    requireCapabilityImpl: async () => { authenticated = true; },
  });
  const response = responseRecorder();
  await handler({ method: 'POST', query: {}, headers: {} }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, 'GET');
  assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers.vary, 'Authorization');
  assert.equal(response.headers['x-municontrol-contract'], 'grh-directory-v1');
  assert.equal(authenticated, false);
});

test('high role, exact user allowlist and tenant gate all precede directory access', async () => {
  let readCount = 0;
  const dependencies = {
    ...PILOT_GUARDS,
    readDirectoryImpl: async () => { readCount += 1; return responseFixture(); },
  };

  const missingAllowlist = createGrhDirectoryHandler({
    ...dependencies,
    environment: pilotEnvironment(),
    requireCapabilityImpl: async () => ({ id: 'official-1', role: 'INTENDENTE', tenantId: 'tenant-test' }),
  });
  const missingResponse = responseRecorder();
  await missingAllowlist(directoryRequest(), missingResponse);
  assert.equal(missingResponse.statusCode, 403);

  const lowRole = createGrhDirectoryHandler({
    ...dependencies,
    environment: pilotEnvironment('official-1'),
    requireCapabilityImpl: async () => ({ id: 'official-1', role: 'TENANT_USER', tenantId: 'tenant-test' }),
  });
  const lowResponse = responseRecorder();
  await lowRole(directoryRequest(), lowResponse);
  assert.equal(lowResponse.statusCode, 403);

  const tenantDenied = createGrhDirectoryHandler({
    ...dependencies,
    environment: pilotEnvironment('official-1'),
    requireCapabilityImpl: async () => ({ id: 'official-1', role: 'TENANT_ADMIN', tenantId: 'foreign' }),
  });
  const tenantResponse = responseRecorder();
  await tenantDenied(directoryRequest(), tenantResponse);
  assert.equal(tenantResponse.statusCode, 403);
  assert.equal(readCount, 0);
});

test('an explicitly allowlisted high-role user receives only a valid directory response', async () => {
  const calls = [];
  const handler = createGrhDirectoryHandler({
    ...PILOT_GUARDS,
    environment: pilotEnvironment('official-1'),
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      calls.push(['capability', resource, action]);
      return {
        id: 'official-1',
        email: 'official-1@junin.gov.ar',
        role: 'INTENDENTE',
        tenantId: 'tenant-test',
      };
    },
    readDirectoryImpl: async options => {
      calls.push(['read', options.tenantId, options.query]);
      return responseFixture();
    },
  });
  const response = responseRecorder();
  await handler(directoryRequest({ search: 'Persona' }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(inspectGrhDirectoryResponse(response.payload).ok, true);
  assert.deepEqual(calls, [
    ['capability', 'grh.directory', 'read'],
    ['read', 'tenant-test', { search: 'Persona' }],
  ]);
});

test('query, not-found, ambiguity and internal failures return detail-free boundaries', async () => {
  const base = {
    ...PILOT_GUARDS,
    environment: pilotEnvironment('official-1'),
    requireCapabilityImpl: async () => ({
      id: 'official-1',
      email: 'official-1@junin.gov.ar',
      role: 'CONTADOR',
      tenantId: 'tenant-test',
    }),
  };
  const scenarios = [
    [400, Object.assign(new Error('private query'), { status: 400 })],
    [404, Object.assign(new Error('private row'), { status: 404 })],
    [409, Object.assign(new Error('private collision'), { status: 409 })],
    [503, new Error('database-url-and-private-name')],
  ];
  for (const [expected, error] of scenarios) {
    const handler = createGrhDirectoryHandler({ ...base, readDirectoryImpl: async () => { throw error; } });
    const response = responseRecorder();
    await withQuietErrors(() => handler(directoryRequest(), response));
    assert.equal(response.statusCode, expected);
    assert.doesNotMatch(JSON.stringify(response.payload), /private|database-url/i);
  }

  const invalidContract = createGrhDirectoryHandler({
    ...base,
    readDirectoryImpl: async () => ({ ...responseFixture(), unexpected: true }),
  });
  const invalidResponse = responseRecorder();
  await withQuietErrors(() => invalidContract(directoryRequest(), invalidResponse));
  assert.equal(invalidResponse.statusCode, 503);
});

test('publication supports caller-owned transactions without committing or rolling back them', async () => {
  function fakeClient(commands) {
    return {
      async query(sql) {
        const text = String(sql).trim();
        commands.push(text);
        if (text.includes('FROM grh_directory_sources') && text.includes('FOR UPDATE')) {
          return { rows: [] };
        }
        if (text.includes('AS people') && text.includes('AS dimensions')) {
          return { rows: [{ people: 1, dimensions: 7, leave_events: 1, position_observations: 1 }] };
        }
        return { rows: [] };
      },
    };
  }

  const externalCommands = [];
  const externalResult = await publishGrhDirectory(
    fakeClient(externalCommands),
    'tenant-test',
    artifactFixture(),
    { transactionMode: 'external' },
  );
  assert.equal(externalResult.status, 'published');
  assert.equal(externalCommands.includes('BEGIN'), false);
  assert.equal(externalCommands.includes('COMMIT'), false);
  assert.equal(externalCommands.includes('ROLLBACK'), false);
  assert.ok(externalCommands.some(sql => sql.includes('grh_directory_leave_events')));

  const managedCommands = [];
  await publishGrhDirectory(fakeClient(managedCommands), 'tenant-test', artifactFixture());
  assert.equal(managedCommands[0], 'BEGIN');
  assert.equal(managedCommands.at(-1), 'COMMIT');
  await assert.rejects(
    () => publishGrhDirectory(fakeClient([]), 'tenant-test', artifactFixture(), { transactionMode: 'invalid' }),
    error => error.code === 'GRH_DIRECTORY_TRANSACTION_MODE_INVALID',
  );
});

test('category dimensions remain distinct by agreement during publication', () => {
  const artifact = artifactFixture();
  const second = structuredClone(artifact.records[0]);
  second.legajo = 1002;
  second.agreement = { code: 9, label: 'Otro convenio' };
  second.category = { code: 3, label: 'Categoria de otro convenio' };
  second.absence = { event_count: 0, latest_date: null };
  second.leave = { event_count: 0, latest_start_date: null, latest_end_date: null };
  second.leave_history = [];
  artifact.records.push(second);
  const categories = flattenGrhDirectoryArtifact(artifact).dimensions
    .filter(item => item.dimension === 'category');
  assert.deepEqual(categories.map(item => [item.scope_code, item.code, item.label]), [
    [2, 3, artifact.records[0].category.label],
    [9, 3, 'Categoria de otro convenio'],
  ]);
  const positions = flattenGrhDirectoryArtifact(artifact).dimensions
    .filter(item => item.dimension === 'position');
  assert.deepEqual(positions.map(item => [item.code, item.label]), [
    [4, 'Cargo'],
    [40, 'Secretaria'],
    [50, 'Municipio'],
  ]);
});
