import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createGrhDomainCatalogHandler } from '../api/grh-domain-catalog.js';
import {
  GRH_DOMAIN_CATALOG_SCHEMA_VERSION,
  GRH_DOMAIN_IDS,
  inspectGrhDomainCatalogContract,
} from '../api/lib/grh-domain-catalog-contract.js';
import { buildGrhDomainCatalogProjection } from '../api/lib/grh-domain-catalog.js';

async function realBundle() {
  const [profile, semantic] = await Promise.all([
    readFile(new URL('../api/_data/grh-profile.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../api/_data/grh-semantic.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  return {
    profile,
    semantic,
    provenance: {
      profileSchemaVersion: profile.schema_version,
      semanticSchemaVersion: semantic.schema_version,
      sourceFile: profile.source,
      sourceSha256: profile.sha256,
      approvedSourceSha256: profile.sha256,
      snapshotAsOf: profile.snapshot_as_of,
    },
  };
}

function responseRecorder() {
  return {
    statusCode: null,
    headers: new Map(),
    payload: null,
    setHeader(name, value) { this.headers.set(String(name).toLowerCase(), String(value)); },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

test('real GRH dictionary projects eight reconciled actionable domains', async () => {
  const projection = buildGrhDomainCatalogProjection(await realBundle());
  const inspection = inspectGrhDomainCatalogContract(projection);
  assert.deepEqual(inspection, { ok: true, errors: [] });
  assert.equal(projection.schemaVersion, GRH_DOMAIN_CATALOG_SCHEMA_VERSION);
  assert.deepEqual(projection.domains.map(domain => domain.id), GRH_DOMAIN_IDS);
  assert.deepEqual(projection.counts, {
    totalTables: 257,
    nonEmptyTables: 147,
    emptyTables: 110,
    totalRows: 6573057,
    mappedTables: 53,
    mappedRows: 6354042,
    domainCount: 8,
  });
  const payroll = projection.domains.find(domain => domain.id === 'nomina_control');
  const career = projection.domains.find(domain => domain.id === 'carrera_desarrollo');
  assert.equal(payroll.counts.rows, 4528682);
  assert.equal(career.counts.rows, 19394);
  assert.equal(payroll.tables.some(table => table.name === 'histocal' && table.label === 'Histórico de cierres de cálculo'), true);
  assert.equal(career.tables.some(table => table.name === 'histocal'), false);
  assert.deepEqual(projection.domains.find(domain => domain.id === 'licencias_salud').periods, {
    first: '1997-08',
    last: '2009-05',
    status: 'historical',
  });
  assert.deepEqual(projection.domains.find(domain => domain.id === 'carrera_desarrollo').periods, {
    first: null,
    last: null,
    status: 'not_available',
  });
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.domains[0].tables[0]), true);
  const actions = projection.domains.flatMap(domain => domain.actions);
  assert.doesNotMatch(JSON.stringify(actions), /peopleDirectory|directorio y fichas|fichas autorizadas/i);
  assert.equal(actions.find(action => action.id === 'open_absence_dashboard').href, '/estructura#novedades-historicas');
  assert.equal(actions.find(action => action.id === 'open_agreement_finance').href, 'hacienda.html#cohortContext');
});

test('catalog contract rejects shape, identity, count, ordering and action drift', async () => {
  const projection = buildGrhDomainCatalogProjection(await realBundle());
  const mutations = [
    value => { value.extra = true; },
    value => { value.source.sourceSha256 = 'invalid'; },
    value => { value.counts.mappedRows += 1; },
    value => { value.domains.reverse(); },
    value => { value.domains[0].tables[0].rows += 1; },
    value => { value.domains[0].tables[0].periods.status = 'current'; },
    value => { value.domains[0].coverage[0].value = 101; },
    value => { value.domains[0].actions[0].href = 'https://external.example'; },
    value => { value.domains[0].actions[0].href = '//external.example/path'; },
    value => { value.domains[0].actions[0].href = '/\\external.example/path'; },
    value => { value.domains[0].actions[0].requiredCapability = 'future.capability'; },
    value => { value.domains[0].actions[0].requiredCapability = 'navigation.does-not-exist'; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(projection);
    mutate(candidate);
    assert.equal(inspectGrhDomainCatalogContract(candidate).ok, false);
  }
});

test('builder fails closed on provenance and dictionary drift', async () => {
  const sourceDrift = await realBundle();
  sourceDrift.provenance.sourceSha256 = '0'.repeat(64);
  assert.throws(() => buildGrhDomainCatalogProjection(sourceDrift), /identidad aprobada/i);

  const dictionaryDrift = await realBundle();
  dictionaryDrift.semantic.table_dictionary.total_rows += 1;
  assert.throws(() => buildGrhDomainCatalogProjection(dictionaryDrift), /diccionario.*no reconcilia/i);

  const missingMappedTable = await realBundle();
  missingMappedTable.semantic.table_dictionary.tables = missingMappedTable.semantic.table_dictionary.tables
    .filter(table => table.table !== 'legajo');
  missingMappedTable.semantic.table_dictionary.total_tables -= 1;
  missingMappedTable.semantic.table_dictionary.non_empty_tables -= 1;
  missingMappedTable.semantic.table_dictionary.total_rows -= 2450;
  assert.throws(() => buildGrhDomainCatalogProjection(missingMappedTable), /tabla legajo/i);
});

test('endpoint is one tenant-bound no-store GET and returns only inspected projection', async () => {
  const bundle = await realBundle();
  let requiredResource = null;
  let requiredAction = null;
  let readTenant = null;
  const handler = createGrhDomainCatalogHandler({
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      requiredResource = resource;
      requiredAction = action;
      return { tenantId: 'tenant-junin' };
    },
    requireDatasetTenantImpl: () => true,
    readArtifactBundleImpl: async tenantId => { readTenant = tenantId; return bundle; },
  });
  const res = responseRecorder();
  await handler({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers.get('x-municontrol-contract'), GRH_DOMAIN_CATALOG_SCHEMA_VERSION);
  assert.match(res.headers.get('cache-control'), /no-store/i);
  assert.equal(res.headers.get('vary'), 'Authorization');
  assert.equal(requiredResource, 'grh.contract');
  assert.equal(requiredAction, 'read');
  assert.equal(readTenant, 'tenant-junin');
  assert.equal(inspectGrhDomainCatalogContract(res.payload).ok, true);
});

test('endpoint rejects methods and query filters before artifact reads', async () => {
  let reads = 0;
  const handler = createGrhDomainCatalogHandler({
    requireCapabilityImpl: async () => ({ tenantId: 'tenant-junin' }),
    requireDatasetTenantImpl: () => true,
    readArtifactBundleImpl: async () => { reads += 1; return realBundle(); },
  });
  const post = responseRecorder();
  await handler({ method: 'POST', query: {} }, post);
  assert.equal(post.statusCode, 405);
  assert.equal(post.headers.get('allow'), 'GET');
  const filtered = responseRecorder();
  await handler({ method: 'GET', query: { domain: 'nomina' } }, filtered);
  assert.equal(filtered.statusCode, 400);
  assert.equal(filtered.payload.code, 'GRH_DOMAIN_CATALOG_QUERY_UNSUPPORTED');
  assert.equal(reads, 0);
});

test('endpoint preserves authorization denials and scopes contract failures to 503', async () => {
  const denied = createGrhDomainCatalogHandler({
    requireCapabilityImpl: async (_req, res) => {
      res.status(403).json({ code: 'FORBIDDEN' });
      return null;
    },
  });
  const deniedRes = responseRecorder();
  await denied({ method: 'GET', query: {} }, deniedRes);
  assert.equal(deniedRes.statusCode, 403);

  const unavailable = createGrhDomainCatalogHandler({
    requireCapabilityImpl: async () => ({ tenantId: 'tenant-junin' }),
    requireDatasetTenantImpl: () => true,
    readArtifactBundleImpl: async () => { throw new Error('sensitive dependency detail'); },
  });
  const unavailableRes = responseRecorder();
  await unavailable({ method: 'GET', query: {} }, unavailableRes);
  assert.equal(unavailableRes.statusCode, 503);
  assert.deepEqual(unavailableRes.payload, {
    error: 'El catalogo de areas GRH no esta disponible.',
    code: 'GRH_DOMAIN_CATALOG_UNAVAILABLE',
  });
  assert.doesNotMatch(JSON.stringify(unavailableRes.payload), /sensitive dependency detail/i);
});
